/**
 * AIF-BIN Recall Benchmarks
 * 
 * Measures performance of key operations:
 * - Indexing speed
 * - Search latency
 * - Memory usage
 * - Scaling characteristics
 */

import { performance } from 'perf_hooks';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
  memoryMB: number;
}

const results: BenchmarkResult[] = [];

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function getMemoryUsageMB(): number {
  const usage = process.memoryUsage();
  return usage.heapUsed / 1024 / 1024;
}

async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  iterations: number = 100
): Promise<BenchmarkResult> {
  const times: number[] = [];
  const startMemory = getMemoryUsageMB();

  // Warmup
  for (let i = 0; i < Math.min(10, iterations); i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const endMemory = getMemoryUsageMB();
  const totalMs = times.reduce((a, b) => a + b, 0);

  const result: BenchmarkResult = {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    opsPerSec: (iterations / totalMs) * 1000,
    memoryMB: endMemory - startMemory
  };

  results.push(result);
  return result;
}

function generateRandomText(words: number): string {
  const vocabulary = [
    'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
    'artificial', 'intelligence', 'memory', 'semantic', 'search',
    'embeddings', 'vectors', 'neural', 'network', 'machine', 'learning',
    'data', 'knowledge', 'context', 'query', 'retrieval', 'index'
  ];
  const result: string[] = [];
  for (let i = 0; i < words; i++) {
    result.push(vocabulary[Math.floor(Math.random() * vocabulary.length)]);
  }
  return result.join(' ');
}

function generateRandomEmbedding(dims: number = 384): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < dims; i++) {
    embedding.push(Math.random() * 2 - 1);
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((a, b) => a + b * b, 0));
  return embedding.map(x => x / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Already normalized
}

// ============== BENCHMARKS ==============

async function benchmarkCosineSimilarity() {
  const dims = 384;
  const a = generateRandomEmbedding(dims);
  const b = generateRandomEmbedding(dims);

  await benchmark('Cosine Similarity (384 dims)', () => {
    cosineSimilarity(a, b);
  }, 10000);
}

async function benchmarkSearchSmall() {
  const numChunks = 1000;
  const dims = 384;
  
  // Build index
  const index: { embedding: number[], content: string }[] = [];
  for (let i = 0; i < numChunks; i++) {
    index.push({
      embedding: generateRandomEmbedding(dims),
      content: generateRandomText(50)
    });
  }

  const query = generateRandomEmbedding(dims);

  await benchmark(`Search ${numChunks} chunks`, () => {
    const results: { score: number, content: string }[] = [];
    for (const chunk of index) {
      const score = cosineSimilarity(query, chunk.embedding);
      if (score > 0.5) {
        results.push({ score, content: chunk.content });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 5);
  }, 1000);
}

async function benchmarkSearchMedium() {
  const numChunks = 10000;
  const dims = 384;
  
  const index: { embedding: number[], content: string }[] = [];
  for (let i = 0; i < numChunks; i++) {
    index.push({
      embedding: generateRandomEmbedding(dims),
      content: generateRandomText(50)
    });
  }

  const query = generateRandomEmbedding(dims);

  await benchmark(`Search ${numChunks} chunks`, () => {
    const results: { score: number, content: string }[] = [];
    for (const chunk of index) {
      const score = cosineSimilarity(query, chunk.embedding);
      if (score > 0.5) {
        results.push({ score, content: chunk.content });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 5);
  }, 100);
}

async function benchmarkSearchLarge() {
  const numChunks = 100000;
  const dims = 384;
  
  console.log(`  Building index with ${numChunks} chunks...`);
  const index: { embedding: number[], content: string }[] = [];
  for (let i = 0; i < numChunks; i++) {
    index.push({
      embedding: generateRandomEmbedding(dims),
      content: generateRandomText(50)
    });
  }

  const query = generateRandomEmbedding(dims);

  await benchmark(`Search ${numChunks} chunks`, () => {
    const results: { score: number, content: string }[] = [];
    for (const chunk of index) {
      const score = cosineSimilarity(query, chunk.embedding);
      if (score > 0.5) {
        results.push({ score, content: chunk.content });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 5);
  }, 10);
}

async function benchmarkChunking() {
  const text = generateRandomText(10000);

  await benchmark('Chunk 10k words', () => {
    const chunks: string[] = [];
    const paragraphs = text.split(/\s+/);
    let current = '';
    
    for (const word of paragraphs) {
      if ((current + ' ' + word).length > 500) {
        chunks.push(current);
        current = word;
      } else {
        current += ' ' + word;
      }
    }
    if (current) chunks.push(current);
  }, 1000);
}

async function benchmarkMessagePack() {
  // Simulate MessagePack encoding/decoding
  const { encode, decode } = await import('msgpackr');
  
  const data = {
    version: 2,
    chunks: Array(100).fill(null).map(() => ({
      content: generateRandomText(50),
      embedding: generateRandomEmbedding(384),
      metadata: { created: Date.now() }
    }))
  };

  await benchmark('MessagePack encode (100 chunks)', () => {
    encode(data);
  }, 100);

  const encoded = encode(data);

  await benchmark('MessagePack decode (100 chunks)', () => {
    decode(encoded);
  }, 100);
}

// ============== MAIN ==============

async function main() {
  console.log('🔬 AIF-BIN Recall Benchmarks');
  console.log('============================\n');

  console.log('Running benchmarks...\n');

  await benchmarkCosineSimilarity();
  await benchmarkSearchSmall();
  await benchmarkSearchMedium();
  await benchmarkSearchLarge();
  await benchmarkChunking();
  
  try {
    await benchmarkMessagePack();
  } catch (e) {
    console.log('  MessagePack benchmark skipped (msgpackr not installed)');
  }

  // Print results
  console.log('\n📊 Results');
  console.log('==========\n');

  console.log('| Benchmark | Avg (ms) | Min (ms) | Max (ms) | Ops/sec | Memory |');
  console.log('|-----------|----------|----------|----------|---------|--------|');

  for (const r of results) {
    console.log(
      `| ${r.name.padEnd(30)} | ${formatNumber(r.avgMs).padStart(8)} | ${formatNumber(r.minMs).padStart(8)} | ${formatNumber(r.maxMs).padStart(8)} | ${formatNumber(r.opsPerSec).padStart(7)} | ${formatNumber(r.memoryMB).padStart(5)}MB |`
    );
  }

  // Write JSON results
  const outputPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    results
  }, null, 2));

  console.log(`\n✅ Results saved to ${outputPath}`);
}

main().catch(console.error);
