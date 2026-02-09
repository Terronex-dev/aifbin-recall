/**
 * SQLite database management for AIF-BIN Recall
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { DEFAULT_CONFIG, type Collection, type MemoryChunk, type EngramConfig } from './types.js';

export class EngramDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = this.resolvePath(dbPath || DEFAULT_CONFIG.index.path);
    
    // Ensure directory exists
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.init();
  }

  private resolvePath(p: string): string {
    if (p.startsWith('~')) {
      return path.join(os.homedir(), p.slice(1));
    }
    return path.resolve(p);
  }

  private init(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Create collections table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        file_count INTEGER DEFAULT 0,
        chunk_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        source_file TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )
    `);

    // Create FTS5 virtual table for keyword search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text,
        content='chunks',
        content_rowid='rowid'
      )
    `);

    // Triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, text) VALUES (NEW.rowid, NEW.text);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', OLD.rowid, OLD.text);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', OLD.rowid, OLD.text);
        INSERT INTO chunks_fts(rowid, text) VALUES (NEW.rowid, NEW.text);
      END
    `);

    // Indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_file)`);
  }

  // Collection operations
  createCollection(name: string, description?: string): Collection {
    const id = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO collections (id, name, description)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, name, description || null);
    return this.getCollection(name)!;
  }

  getCollection(name: string): Collection | null {
    const stmt = this.db.prepare(`SELECT * FROM collections WHERE name = ?`);
    const row = stmt.get(name) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      fileCount: row.file_count,
      chunkCount: row.chunk_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  getCollectionById(id: string): Collection | null {
    const stmt = this.db.prepare(`SELECT * FROM collections WHERE id = ?`);
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      fileCount: row.file_count,
      chunkCount: row.chunk_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  listCollections(): Collection[] {
    const stmt = this.db.prepare(`SELECT * FROM collections ORDER BY name`);
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      fileCount: row.file_count,
      chunkCount: row.chunk_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  deleteCollection(name: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM collections WHERE name = ?`);
    const result = stmt.run(name);
    return result.changes > 0;
  }

  // Chunk operations
  insertChunk(chunk: Omit<MemoryChunk, 'createdAt' | 'updatedAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, collection_id, source_file, chunk_index, text, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Convert embedding array to binary buffer
    const embeddingBuffer = Buffer.from(new Float32Array(chunk.embedding).buffer);
    
    stmt.run(
      chunk.id,
      chunk.collectionId,
      chunk.sourceFile,
      chunk.chunkIndex,
      chunk.text,
      embeddingBuffer,
      JSON.stringify(chunk.metadata)
    );
  }

  insertChunks(chunks: Omit<MemoryChunk, 'createdAt' | 'updatedAt'>[]): void {
    const insert = this.db.prepare(`
      INSERT INTO chunks (id, collection_id, source_file, chunk_index, text, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((chunks: Omit<MemoryChunk, 'createdAt' | 'updatedAt'>[]) => {
      for (const chunk of chunks) {
        const embeddingBuffer = Buffer.from(new Float32Array(chunk.embedding).buffer);
        insert.run(
          chunk.id,
          chunk.collectionId,
          chunk.sourceFile,
          chunk.chunkIndex,
          chunk.text,
          embeddingBuffer,
          JSON.stringify(chunk.metadata)
        );
      }
    });

    insertMany(chunks);
  }

  getChunk(id: string): MemoryChunk | null {
    const stmt = this.db.prepare(`SELECT * FROM chunks WHERE id = ?`);
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.rowToChunk(row);
  }

  getChunksByCollection(collectionId: string): MemoryChunk[] {
    const stmt = this.db.prepare(`SELECT * FROM chunks WHERE collection_id = ?`);
    const rows = stmt.all(collectionId) as any[];
    return rows.map(row => this.rowToChunk(row));
  }

  deleteChunksBySource(sourceFile: string): number {
    const stmt = this.db.prepare(`DELETE FROM chunks WHERE source_file = ?`);
    const result = stmt.run(sourceFile);
    return result.changes;
  }

  deleteChunk(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM chunks WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  listFiles(collectionId?: string): { sourceFile: string; chunkCount: number }[] {
    let stmt;
    if (collectionId) {
      stmt = this.db.prepare(`
        SELECT source_file, COUNT(*) as chunk_count 
        FROM chunks 
        WHERE collection_id = ? 
        GROUP BY source_file 
        ORDER BY source_file
      `);
      return (stmt.all(collectionId) as any[]).map(row => ({
        sourceFile: row.source_file,
        chunkCount: row.chunk_count,
      }));
    } else {
      stmt = this.db.prepare(`
        SELECT source_file, COUNT(*) as chunk_count 
        FROM chunks 
        GROUP BY source_file 
        ORDER BY source_file
      `);
      return (stmt.all() as any[]).map(row => ({
        sourceFile: row.source_file,
        chunkCount: row.chunk_count,
      }));
    }
  }

  getChunksBySourceFile(sourceFile: string): MemoryChunk[] {
    const stmt = this.db.prepare(`SELECT * FROM chunks WHERE source_file = ? ORDER BY chunk_index`);
    const rows = stmt.all(sourceFile) as any[];
    return rows.map(row => this.rowToChunk(row));
  }

  // Search operations
  getAllChunksWithEmbeddings(collectionId?: string): MemoryChunk[] {
    let stmt;
    if (collectionId) {
      stmt = this.db.prepare(`SELECT * FROM chunks WHERE collection_id = ?`);
      return (stmt.all(collectionId) as any[]).map(row => this.rowToChunk(row));
    } else {
      stmt = this.db.prepare(`SELECT * FROM chunks`);
      return (stmt.all() as any[]).map(row => this.rowToChunk(row));
    }
  }

  keywordSearch(query: string, collectionId?: string, limit: number = 10): { id: string; score: number }[] {
    // Escape special FTS5 characters and wrap in quotes for phrase matching
    const escapedQuery = '"' + query.replace(/"/g, '""') + '"';
    
    let sql = `
      SELECT chunks.id, bm25(chunks_fts) as score
      FROM chunks_fts
      JOIN chunks ON chunks.rowid = chunks_fts.rowid
      WHERE chunks_fts MATCH ?
    `;
    
    const params: any[] = [escapedQuery];
    
    if (collectionId) {
      sql += ` AND chunks.collection_id = ?`;
      params.push(collectionId);
    }
    
    sql += ` ORDER BY score LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as { id: string; score: number }[];
  }

  updateCollectionStats(collectionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE collections SET
        file_count = (SELECT COUNT(DISTINCT source_file) FROM chunks WHERE collection_id = ?),
        chunk_count = (SELECT COUNT(*) FROM chunks WHERE collection_id = ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(collectionId, collectionId, collectionId);
  }

  private rowToChunk(row: any): MemoryChunk {
    // Convert binary buffer back to Float32Array, then to regular array
    const embeddingBuffer = row.embedding as Buffer;
    const embedding = Array.from(new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.length / 4));

    return {
      id: row.id,
      collectionId: row.collection_id,
      sourceFile: row.source_file,
      chunkIndex: row.chunk_index,
      text: row.text,
      embedding,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  close(): void {
    this.db.close();
  }
}
