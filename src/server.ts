/**
 * HTTP server for AIF-BIN Recall
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import type { ServerConfig, SearchOptions } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { EngramDB } from './db.js';
import { SearchEngine } from './search.js';
import { Indexer } from './indexer.js';
import { Embedder, type EmbeddingModelName } from './embedder.js';

export interface ServerOptions {
  db: EngramDB;
  config?: Partial<ServerConfig>;
}

export function createServer(options: ServerOptions): express.Application {
  const { db, config } = options;
  const serverConfig = { ...DEFAULT_CONFIG.server, ...config };
  
  const app = express();
  const search = new SearchEngine(db);
  const indexer = new Indexer(db);

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  
  // Serve static files from public directory
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // List collections
  app.get('/collections', (_req: Request, res: Response) => {
    try {
      const collections = db.listCollections();
      res.json({ collections });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Get collection
  app.get('/collections/:name', (req: Request, res: Response) => {
    try {
      const collection = db.getCollection(req.params.name);
      if (!collection) {
        res.status(404).json({ error: 'Collection not found' });
        return;
      }
      res.json(collection);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Create collection
  app.post('/collections/:name', (req: Request, res: Response) => {
    try {
      const { description } = req.body || {};
      const existing = db.getCollection(req.params.name);
      if (existing) {
        res.json(existing);
        return;
      }
      const collection = db.createCollection(req.params.name, description);
      res.status(201).json(collection);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Delete collection
  app.delete('/collections/:name', (req: Request, res: Response) => {
    try {
      const deleted = db.deleteCollection(req.params.name);
      if (!deleted) {
        res.status(404).json({ error: 'Collection not found' });
        return;
      }
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Lazy-loaded embedder for text queries
  let embedder: Embedder | null = null;
  
  async function getEmbedder(model?: EmbeddingModelName): Promise<Embedder> {
    if (!embedder) {
      embedder = new Embedder(model || 'minilm');
      await embedder.init();
    }
    return embedder;
  }

  // Helper to strip embedding from metadata (it's huge and rarely needed in responses)
  function cleanMetadata(metadata: Record<string, unknown> | undefined, verbose: boolean): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    if (verbose) return metadata;
    // Strip out the embedding array, keep everything else
    const { embedding, embeddingDim, ...rest } = metadata as Record<string, unknown>;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }

  // Search - accepts either embedding array OR text query (will embed automatically)
  app.post('/search', async (req: Request, res: Response) => {
    try {
      const { embedding, query, text, collection, limit, threshold, hybridWeight, model, verbose } = req.body;
      
      // Use 'query' or 'text' for the search text
      const queryText = query || text;

      // Get or generate embedding
      let queryEmbedding: number[];
      if (embedding && Array.isArray(embedding)) {
        queryEmbedding = embedding;
      } else if (queryText) {
        // Auto-embed the query text
        const emb = await getEmbedder(model);
        queryEmbedding = await emb.embed(queryText);
      } else {
        res.status(400).json({ 
          error: 'Either "query" (text) or "embedding" (array) required',
          hint: 'Send { "query": "your search text" } for automatic embedding',
        });
        return;
      }

      const options: SearchOptions = {
        collection,
        limit: limit || 10,
        threshold: threshold || 0,
        hybridWeight: hybridWeight ?? 0.7,
      };

      let results;
      if (queryText && (hybridWeight ?? 0.7) < 1.0) {
        results = await search.hybridSearch(queryEmbedding, queryText, options);
      } else {
        results = await search.search(queryEmbedding, options);
      }

      const includeVerbose = verbose === true;
      res.json({
        results: results.map(r => ({
          id: r.chunk.id,
          text: r.chunk.text,
          score: r.score,
          vectorScore: r.vectorScore,
          keywordScore: r.keywordScore,
          sourceFile: r.chunk.sourceFile,
          chunkIndex: r.chunk.chunkIndex,
          ...(cleanMetadata(r.chunk.metadata, includeVerbose) && { metadata: cleanMetadata(r.chunk.metadata, includeVerbose) }),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET search - simple text query
  app.get('/search', async (req: Request, res: Response) => {
    try {
      const { q, query, collection, limit, verbose } = req.query;
      const queryText = (q || query) as string;

      if (!queryText) {
        res.status(400).json({
          error: 'Query parameter "q" or "query" required',
          example: '/search?q=your+search+text&collection=myproject',
        });
        return;
      }

      // Embed the query
      const emb = await getEmbedder();
      const queryEmbedding = await emb.embed(queryText);

      const options: SearchOptions = {
        collection: collection as string,
        limit: limit ? parseInt(limit as string, 10) : 10,
      };

      const results = await search.hybridSearch(queryEmbedding, queryText, options);

      const includeVerbose = verbose === 'true' || verbose === '1';
      res.json({
        query: queryText,
        results: results.map(r => ({
          id: r.chunk.id,
          text: r.chunk.text,
          score: r.score,
          vectorScore: r.vectorScore,
          keywordScore: r.keywordScore,
          sourceFile: r.chunk.sourceFile,
          chunkIndex: r.chunk.chunkIndex,
          ...(cleanMetadata(r.chunk.metadata, includeVerbose) && { metadata: cleanMetadata(r.chunk.metadata, includeVerbose) }),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Recall specific chunk
  app.get('/recall/:id', (req: Request, res: Response) => {
    try {
      const chunk = search.recall(req.params.id);
      if (!chunk) {
        res.status(404).json({ error: 'Chunk not found' });
        return;
      }
      res.json({
        id: chunk.id,
        text: chunk.text,
        sourceFile: chunk.sourceFile,
        chunkIndex: chunk.chunkIndex,
        metadata: chunk.metadata,
        createdAt: chunk.createdAt,
        updatedAt: chunk.updatedAt,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Index a directory
  app.post('/index', (req: Request, res: Response) => {
    try {
      const { path: dirPath, collection, recursive } = req.body;

      if (!dirPath || !collection) {
        res.status(400).json({ error: 'path and collection required' });
        return;
      }

      const result = indexer.indexDirectory(dirPath, {
        collection,
        recursive: recursive !== false,
      });

      res.json({
        indexed: true,
        files: result.files,
        chunks: result.chunks,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // List all unique files
  app.get('/files', (req: Request, res: Response) => {
    try {
      const { collection } = req.query;
      const collectionObj = collection ? db.getCollection(collection as string) : null;
      const files = db.listFiles(collectionObj?.id);
      res.json({ files });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Get chunks for a specific file
  app.get('/files/:path(*)', (req: Request, res: Response) => {
    try {
      const filePath = '/' + req.params.path;
      const chunks = db.getChunksBySourceFile(filePath);
      if (chunks.length === 0) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res.json({
        file: filePath,
        chunks: chunks.map(c => ({
          id: c.id,
          text: c.text,
          chunkIndex: c.chunkIndex,
          createdAt: c.createdAt,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Delete a specific chunk
  app.delete('/chunks/:id', (req: Request, res: Response) => {
    try {
      const chunk = db.getChunk(req.params.id);
      if (!chunk) {
        res.status(404).json({ error: 'Chunk not found' });
        return;
      }
      const deleted = db.deleteChunk(req.params.id);
      if (deleted) {
        db.updateCollectionStats(chunk.collectionId);
      }
      res.json({ deleted });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Delete all chunks from a file
  app.delete('/files/:path(*)', (req: Request, res: Response) => {
    try {
      const filePath = '/' + req.params.path;
      const chunks = db.getChunksBySourceFile(filePath);
      if (chunks.length === 0) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      const collectionId = chunks[0].collectionId;
      const count = db.deleteChunksBySource(filePath);
      db.updateCollectionStats(collectionId);
      res.json({ deleted: count });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Server settings/config endpoint
  app.get('/settings', (_req: Request, res: Response) => {
    res.json({
      version: '0.1.0',
      embeddingModel: 'minilm',
      chunkSize: 1000,
      chunkOverlap: 200,
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function startServer(options: ServerOptions): void {
  const config = { ...DEFAULT_CONFIG.server, ...options.config };
  const app = createServer(options);

  app.listen(config.port, config.host, () => {
    console.log(`AIF-BIN Recall server running at http://${config.host}:${config.port}`);
    console.log('');
    console.log('Endpoints:');
    console.log('  GET  /health          - Health check');
    console.log('  GET  /collections     - List collections');
    console.log('  POST /collections/:n  - Create collection');
    console.log('  POST /search          - Semantic search');
    console.log('  GET  /recall/:id      - Retrieve chunk');
    console.log('  POST /index           - Index directory');
  });
}
