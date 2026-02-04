/**
 * AIF-BIN Recall - Local-first memory server for AI agents
 * 
 * @example
 * ```typescript
 * import { EngramDB, SearchEngine, Indexer } from '@terronex/engram';
 * 
 * const db = new EngramDB('~/.engram/index.db');
 * const indexer = new Indexer(db);
 * const search = new SearchEngine(db);
 * 
 * // Index AIF-BIN files
 * indexer.indexDirectory('./memories', { collection: 'my-project' });
 * 
 * // Search with embedding
 * const results = await search.search(queryEmbedding, { collection: 'my-project' });
 * ```
 */

// Core classes
export { EngramDB } from './db.js';
export { SearchEngine, cosineSimilarity } from './search.js';
export { Indexer, parseAifBinFile, findAifBinFiles } from './indexer.js';
export { Embedder, embedQuery, getDefaultEmbedder, EMBEDDING_MODELS, type EmbeddingModelName } from './embedder.js';

// Server functions
export { createServer, startServer } from './server.js';
export { startMcpServer } from './mcp.js';

// Types
export type {
  MemoryChunk,
  Collection,
  SearchResult,
  SearchOptions,
  IndexOptions,
  EngramConfig,
  ServerConfig,
  IndexConfig,
  SearchConfig,
  AifBinFile,
  AifBinChunk,
  AifBinHeader,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';
