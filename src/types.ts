/**
 * Core types for Engram memory server
 */

export interface MemoryChunk {
  id: string;
  collectionId: string;
  sourceFile: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  fileCount: number;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResult {
  chunk: MemoryChunk;
  score: number;
  vectorScore: number;
  keywordScore?: number;
}

export interface SearchOptions {
  collection?: string;
  limit?: number;
  threshold?: number;
  hybridWeight?: number; // 0 = keywords only, 1 = vectors only
  filters?: Record<string, unknown>;
}

export interface IndexOptions {
  collection: string;
  recursive?: boolean;
  watch?: boolean;
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface IndexConfig {
  path: string;
}

export interface SearchConfig {
  defaultLimit: number;
  hybridWeight: number;
}

export interface EngramConfig {
  server: ServerConfig;
  index: IndexConfig;
  search: SearchConfig;
}

export const DEFAULT_CONFIG: EngramConfig = {
  server: {
    port: 3847,
    host: 'localhost',
  },
  index: {
    path: '~/.engram/index.db',
  },
  search: {
    defaultLimit: 10,
    hybridWeight: 0.7,
  },
};

export interface AifBinHeader {
  magic: Uint8Array;
  version: number;
  flags: number;
  chunkCount: number;
  embeddingDim: number;
  createdAt: number;
  modifiedAt: number;
}

export interface AifBinChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface AifBinFile {
  header: AifBinHeader;
  chunks: AifBinChunk[];
  sourcePath: string;
}
