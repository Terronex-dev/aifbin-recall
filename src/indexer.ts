/**
 * AIF-BIN file indexer for Engram
 */

import fs from 'fs';
import path from 'path';
import { unpack } from 'msgpackr';
import type { AifBinFile, AifBinChunk, AifBinHeader, MemoryChunk, IndexOptions } from './types.js';
import { EngramDB } from './db.js';

// AIF-BIN v2 magic bytes
const MAGIC = new Uint8Array([0x41, 0x49, 0x46, 0x42, 0x49, 0x4e, 0x00, 0x01]); // "AIFBIN\x00\x01"

/**
 * Parse an AIF-BIN v2 file
 */
export function parseAifBinFile(filePath: string): AifBinFile {
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);

  // Verify magic bytes
  const magic = data.slice(0, 8);
  if (!magic.every((byte, i) => byte === MAGIC[i])) {
    throw new Error(`Invalid AIF-BIN file: bad magic bytes in ${filePath}`);
  }

  // Parse header (bytes 8-39)
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  const version = view.getUint16(8, true);
  const flags = view.getUint16(10, true);
  const chunkCount = view.getUint32(12, true);
  const embeddingDim = view.getUint32(16, true);
  const createdAt = Number(view.getBigUint64(20, true));
  const modifiedAt = Number(view.getBigUint64(28, true));
  // Reserved: bytes 36-39

  const header: AifBinHeader = {
    magic,
    version,
    flags,
    chunkCount,
    embeddingDim,
    createdAt,
    modifiedAt,
  };

  // Parse body (MessagePack encoded, starts at byte 40)
  const bodyStart = 40;
  
  // Find footer (last 16 bytes: 8-byte CRC64 + 8-byte file size)
  const footerStart = buffer.length - 16;
  const bodyData = buffer.slice(bodyStart, footerStart);

  // Decode MessagePack body
  const body = unpack(bodyData) as {
    metadata?: Record<string, unknown>;
    chunks: Array<{
      id: string;
      text: string;
      embedding: number[];
      metadata?: Record<string, unknown>;
    }>;
  };

  const chunks: AifBinChunk[] = body.chunks.map(c => ({
    id: c.id,
    text: c.text,
    embedding: c.embedding,
    metadata: c.metadata || {},
  }));

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
    
    // Delete existing chunks from this file (for re-indexing)
    this.db.deleteChunksBySource(filePath);

    // Convert to MemoryChunks and insert
    const chunks: Omit<MemoryChunk, 'createdAt' | 'updatedAt'>[] = aifbin.chunks.map((chunk, index) => ({
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
    for (const file of files) {
      try {
        const count = this.indexFile(file, col.id);
        totalChunks += count;
        console.log(`  Indexed: ${path.basename(file)} (${count} chunks)`);
      } catch (err) {
        console.error(`  Failed: ${path.basename(file)} - ${err}`);
      }
    }

    // Update collection stats
    this.db.updateCollectionStats(col.id);

    return { files: files.length, chunks: totalChunks };
  }

  /**
   * Remove a file from the index
   */
  removeFile(filePath: string): number {
    return this.db.deleteChunksBySource(filePath);
  }
}
