/**
 * AIF-BIN file indexer for AIF-BIN Recall
 * Parses AIF-BIN v2 binary format
 */

import fs from 'fs';
import path from 'path';
import { unpack } from 'msgpackr';
import type { AifBinFile, AifBinChunk, AifBinHeader, MemoryChunk, IndexOptions } from './types.js';
import { EngramDB } from './db.js';

// AIF-BIN v2 constants
const MAGIC = Buffer.from([0x41, 0x49, 0x46, 0x42, 0x49, 0x4e, 0x00, 0x01]); // "AIFBIN\x00\x01"
const HEADER_SIZE = 64;
const ABSENT_OFFSET = BigInt('0xFFFFFFFFFFFFFFFF');

// Chunk types
enum ChunkType {
  TEXT = 1,
  TABLE_JSON = 2,
  IMAGE = 3,
  AUDIO = 4,
  VIDEO = 5,
  CODE = 6,
}

/**
 * Parse an AIF-BIN v2 file
 */
export function parseAifBinFile(filePath: string): AifBinFile {
  const buffer = fs.readFileSync(filePath);
  
  if (buffer.length < HEADER_SIZE) {
    throw new Error(`File too small: ${filePath}`);
  }

  // Verify magic bytes
  const magic = buffer.subarray(0, 8);
  if (!magic.equals(MAGIC)) {
    throw new Error(`Invalid AIF-BIN file: bad magic bytes in ${filePath}`);
  }

  // Parse header (64 bytes)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  const version = view.getUint32(8, true);
  // padding at 12-15
  const metadataOffset = view.getBigUint64(16, true);
  const originalRawOffset = view.getBigUint64(24, true);
  const contentChunksOffset = view.getBigUint64(32, true);
  const versionsOffset = view.getBigUint64(40, true);
  const footerOffset = view.getBigUint64(48, true);
  const totalSize = view.getBigUint64(56, true);

  const header: AifBinHeader = {
    magic: new Uint8Array(magic),
    version,
    flags: 0,
    chunkCount: 0,
    embeddingDim: 0,
    createdAt: 0,
    modifiedAt: 0,
  };

  // Parse metadata section
  let metadata: Record<string, unknown> = {};
  if (metadataOffset !== ABSENT_OFFSET) {
    const metaStart = Number(metadataOffset);
    const metaLength = view.getBigUint64(metaStart, true);
    const metaData = buffer.subarray(metaStart + 8, metaStart + 8 + Number(metaLength));
    try {
      metadata = unpack(metaData) as Record<string, unknown>;
    } catch (e) {
      // Metadata parse failed, continue with empty
    }
  }

  // Parse content chunks section
  const chunks: AifBinChunk[] = [];
  if (contentChunksOffset !== ABSENT_OFFSET) {
    const chunksStart = Number(contentChunksOffset);
    const chunkCount = view.getUint32(chunksStart, true);
    header.chunkCount = chunkCount;
    
    let offset = chunksStart + 4;
    
    for (let i = 0; i < chunkCount; i++) {
      try {
        const chunkType = view.getUint32(offset, true);
        offset += 4;
        
        const dataLength = Number(view.getBigUint64(offset, true));
        offset += 8;
        
        const metadataLength = Number(view.getBigUint64(offset, true));
        offset += 8;
        
        // Parse chunk metadata
        let chunkMeta: Record<string, unknown> = {};
        if (metadataLength > 0) {
          const chunkMetaData = buffer.subarray(offset, offset + metadataLength);
          try {
            chunkMeta = unpack(chunkMetaData) as Record<string, unknown>;
          } catch (e) {
            // Skip bad metadata
          }
          offset += metadataLength;
        }
        
        // Parse chunk data
        const chunkData = buffer.subarray(offset, offset + dataLength);
        offset += dataLength;
        
        // Extract text content based on chunk type
        let text = '';
        if (chunkType === ChunkType.TEXT || chunkType === ChunkType.CODE) {
          text = chunkData.toString('utf-8');
        } else if (chunkType === ChunkType.TABLE_JSON) {
          try {
            const tableData = JSON.parse(chunkData.toString('utf-8'));
            text = JSON.stringify(tableData);
          } catch {
            text = chunkData.toString('utf-8');
          }
        }
        
        // Extract embedding if present in chunk metadata
        const embedding = (chunkMeta.embedding as number[]) || [];
        if (embedding.length > 0 && header.embeddingDim === 0) {
          header.embeddingDim = embedding.length;
        }
        
        chunks.push({
          id: (chunkMeta.id as string) || crypto.randomUUID(),
          text,
          embedding,
          metadata: chunkMeta,
        });
      } catch (e) {
        // Skip malformed chunk
        console.error(`  Warning: Failed to parse chunk ${i} in ${path.basename(filePath)}`);
        break;
      }
    }
  }

  // Extract timestamps from metadata if available
  if (metadata.created_at) {
    header.createdAt = new Date(metadata.created_at as string).getTime();
  }
  if (metadata.modified_at) {
    header.modifiedAt = new Date(metadata.modified_at as string).getTime();
  }

  return {
    header,
    chunks,
    sourcePath: filePath,
  };
}

/**
 * Find all .aif-bin files in a directory
 */
export function findAifBinFiles(dir: string, recursive: boolean = true): string[] {
  const files: string[] = [];

  function scan(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory() && recursive) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.aif-bin')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

export class Indexer {
  private db: EngramDB;

  constructor(db: EngramDB) {
    this.db = db;
  }

  /**
   * Index a single AIF-BIN file into a collection
   */
  indexFile(filePath: string, collectionId: string): number {
    const aifbin = parseAifBinFile(filePath);
    
    // Skip files with no chunks or no embeddings
    const chunksWithEmbeddings = aifbin.chunks.filter(c => c.embedding.length > 0);
    if (chunksWithEmbeddings.length === 0) {
      console.log(`  Skipped: ${path.basename(filePath)} (no embeddings)`);
      return 0;
    }
    
    // Delete existing chunks from this file (for re-indexing)
    this.db.deleteChunksBySource(filePath);

    // Convert to MemoryChunks and insert
    const chunks: Omit<MemoryChunk, 'createdAt' | 'updatedAt'>[] = chunksWithEmbeddings.map((chunk, index) => ({
      id: chunk.id || crypto.randomUUID(),
      collectionId,
      sourceFile: filePath,
      chunkIndex: index,
      text: chunk.text,
      embedding: chunk.embedding,
      metadata: {
        ...chunk.metadata,
        embeddingDim: aifbin.header.embeddingDim,
        originalCreatedAt: aifbin.header.createdAt,
        originalModifiedAt: aifbin.header.modifiedAt,
      },
    }));

    this.db.insertChunks(chunks);
    return chunks.length;
  }

  /**
   * Index a directory of AIF-BIN files
   */
  indexDirectory(dir: string, options: IndexOptions): { files: number; chunks: number } {
    const { collection, recursive = true } = options;

    // Get or create collection
    let col = this.db.getCollection(collection);
    if (!col) {
      col = this.db.createCollection(collection);
    }

    // Find all .aif-bin files
    const files = findAifBinFiles(dir, recursive);
    
    let totalChunks = 0;
    let successFiles = 0;
    
    for (const file of files) {
      try {
        const count = this.indexFile(file, col.id);
        if (count > 0) {
          totalChunks += count;
          successFiles++;
          console.log(`  Indexed: ${path.basename(file)} (${count} chunks)`);
        }
      } catch (err) {
        console.error(`  Failed: ${path.basename(file)} - ${err}`);
      }
    }

    // Update collection stats
    this.db.updateCollectionStats(col.id);

    return { files: successFiles, chunks: totalChunks };
  }

  /**
   * Remove a file from the index
   */
  removeFile(filePath: string): number {
    return this.db.deleteChunksBySource(filePath);
  }
}
