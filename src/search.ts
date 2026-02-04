/**
 * Search functionality for Engram
 */

import type { MemoryChunk, SearchResult, SearchOptions, SearchConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { EngramDB } from './db.js';

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Normalize BM25 scores to 0-1 range
 */
function normalizeBM25Scores(scores: { id: string; score: number }[]): Map<string, number> {
  if (scores.length === 0) return new Map();

  // BM25 scores are negative in SQLite FTS5 (lower is better)
  const minScore = Math.min(...scores.map(s => s.score));
  const maxScore = Math.max(...scores.map(s => s.score));
  const range = maxScore - minScore || 1;

  const normalized = new Map<string, number>();
  for (const { id, score } of scores) {
    // Invert and normalize: best match (lowest BM25) becomes highest score
    normalized.set(id, 1 - (score - minScore) / range);
  }

  return normalized;
}

export class SearchEngine {
  private db: EngramDB;
  private config: SearchConfig;

  constructor(db: EngramDB, config?: Partial<SearchConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG.search, ...config };
  }

  /**
   * Perform semantic search using query embedding
   */
  async search(
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      collection,
      limit = this.config.defaultLimit,
      threshold = 0.0,
      hybridWeight = this.config.hybridWeight,
    } = options;

    // Get collection ID if name provided
    let collectionId: string | undefined;
    if (collection) {
      const col = this.db.getCollection(collection);
      if (!col) {
        throw new Error(`Collection not found: ${collection}`);
      }
      collectionId = col.id;
    }

    // Get all chunks with embeddings
    const chunks = this.db.getAllChunksWithEmbeddings(collectionId);
    
    if (chunks.length === 0) {
      return [];
    }

    // Calculate vector similarity scores
    const vectorScores: { chunk: MemoryChunk; score: number }[] = [];
    for (const chunk of chunks) {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= threshold) {
        vectorScores.push({ chunk, score });
      }
    }

    // Sort by vector score
    vectorScores.sort((a, b) => b.score - a.score);

    // If pure vector search (hybridWeight = 1), return top results
    if (hybridWeight >= 1.0) {
      return vectorScores.slice(0, limit).map(({ chunk, score }) => ({
        chunk,
        score,
        vectorScore: score,
      }));
    }

    // For hybrid search, we need the query text (not available here)
    // This will be handled at a higher level
    return vectorScores.slice(0, limit).map(({ chunk, score }) => ({
      chunk,
      score,
      vectorScore: score,
    }));
  }

  /**
   * Perform hybrid search combining vector similarity and keyword matching
   */
  async hybridSearch(
    queryEmbedding: number[],
    queryText: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      collection,
      limit = this.config.defaultLimit,
      threshold = 0.0,
      hybridWeight = this.config.hybridWeight,
    } = options;

    // Get collection ID
    let collectionId: string | undefined;
    if (collection) {
      const col = this.db.getCollection(collection);
      if (!col) {
        throw new Error(`Collection not found: ${collection}`);
      }
      collectionId = col.id;
    }

    // Get all chunks
    const chunks = this.db.getAllChunksWithEmbeddings(collectionId);
    if (chunks.length === 0) return [];

    // Calculate vector scores
    const vectorScoreMap = new Map<string, number>();
    for (const chunk of chunks) {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      vectorScoreMap.set(chunk.id, score);
    }

    // Get keyword scores (BM25)
    const keywordResults = this.db.keywordSearch(queryText, collectionId, limit * 3);
    const keywordScoreMap = normalizeBM25Scores(keywordResults);

    // Combine scores
    const results: SearchResult[] = [];
    const chunkMap = new Map(chunks.map(c => [c.id, c]));

    // Score all chunks that have either vector or keyword hits
    const allIds = new Set([...vectorScoreMap.keys(), ...keywordScoreMap.keys()]);
    
    for (const id of allIds) {
      const chunk = chunkMap.get(id);
      if (!chunk) continue;

      const vectorScore = vectorScoreMap.get(id) || 0;
      const keywordScore = keywordScoreMap.get(id) || 0;

      // Weighted combination
      const combinedScore = hybridWeight * vectorScore + (1 - hybridWeight) * keywordScore;

      if (combinedScore >= threshold) {
        results.push({
          chunk,
          score: combinedScore,
          vectorScore,
          keywordScore,
        });
      }
    }

    // Sort by combined score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Recall a specific chunk by ID
   */
  recall(id: string): MemoryChunk | null {
    return this.db.getChunk(id);
  }
}
