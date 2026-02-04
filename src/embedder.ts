/**
 * Local embedding generation for Engram
 * Uses @xenova/transformers to run sentence-transformers models locally
 */

import { pipeline, env } from '@xenova/transformers';

// Disable local model check (download from HuggingFace)
env.allowLocalModels = false;

// Supported embedding models (same as AIF-BIN Pro)
export const EMBEDDING_MODELS = {
  minilm: 'Xenova/all-MiniLM-L6-v2',           // 384 dims, fastest
  mpnet: 'Xenova/all-mpnet-base-v2',           // 768 dims, balanced
  'bge-small': 'Xenova/bge-small-en-v1.5',     // 384 dims, good quality
  'bge-base': 'Xenova/bge-base-en-v1.5',       // 768 dims, best quality
  'e5-small': 'Xenova/e5-small-v2',            // 384 dims
} as const;

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

// Cache for loaded pipelines
const pipelineCache = new Map<string, any>();

/**
 * Get or create an embedding pipeline for the given model
 */
async function getEmbedder(model: EmbeddingModelName = 'minilm') {
  const modelPath = EMBEDDING_MODELS[model];
  
  if (!pipelineCache.has(modelPath)) {
    console.log(`Loading embedding model: ${model} (${modelPath})...`);
    const embedder = await pipeline('feature-extraction', modelPath);
    pipelineCache.set(modelPath, embedder);
    console.log(`Model loaded: ${model}`);
  }
  
  return pipelineCache.get(modelPath);
}

/**
 * Mean pooling for sentence embeddings
 */
function meanPool(embeddings: number[][]): number[] {
  const dims = embeddings[0].length;
  const result = new Array(dims).fill(0);
  
  for (const embedding of embeddings) {
    for (let i = 0; i < dims; i++) {
      result[i] += embedding[i];
    }
  }
  
  for (let i = 0; i < dims; i++) {
    result[i] /= embeddings.length;
  }
  
  return result;
}

/**
 * Normalize a vector to unit length
 */
function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

export class Embedder {
  private model: EmbeddingModelName;
  private embedder: any = null;
  private loading: Promise<void> | null = null;

  constructor(model: EmbeddingModelName = 'minilm') {
    this.model = model;
  }

  /**
   * Ensure the model is loaded
   */
  async init(): Promise<void> {
    if (this.embedder) return;
    
    if (!this.loading) {
      this.loading = (async () => {
        this.embedder = await getEmbedder(this.model);
      })();
    }
    
    await this.loading;
  }

  /**
   * Embed a single text string
   */
  async embed(text: string): Promise<number[]> {
    await this.init();
    
    const output = await this.embedder(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    // Convert to regular array
    return Array.from(output.data);
  }

  /**
   * Embed multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.init();
    
    const results: number[][] = [];
    
    // Process in batches to avoid memory issues
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      for (const text of batch) {
        const embedding = await this.embed(text);
        results.push(embedding);
      }
    }
    
    return results;
  }

  /**
   * Get the embedding dimension for the current model
   */
  getDimension(): number {
    switch (this.model) {
      case 'minilm':
      case 'bge-small':
      case 'e5-small':
        return 384;
      case 'mpnet':
      case 'bge-base':
        return 768;
      default:
        return 384;
    }
  }

  /**
   * Get the model name
   */
  getModelName(): string {
    return this.model;
  }
}

// Singleton instance for default model
let defaultEmbedder: Embedder | null = null;

/**
 * Get the default embedder instance
 */
export function getDefaultEmbedder(model: EmbeddingModelName = 'minilm'): Embedder {
  if (!defaultEmbedder || defaultEmbedder.getModelName() !== model) {
    defaultEmbedder = new Embedder(model);
  }
  return defaultEmbedder;
}

/**
 * Quick helper to embed a single query
 */
export async function embedQuery(text: string, model: EmbeddingModelName = 'minilm'): Promise<number[]> {
  const embedder = getDefaultEmbedder(model);
  return embedder.embed(text);
}
