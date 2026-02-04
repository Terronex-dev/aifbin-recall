/**
 * HTTP server for Engram
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import type { ServerConfig, SearchOptions } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { EngramDB } from './db.js';
import { SearchEngine } from './search.js';
import { Indexer } from './indexer.js';

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

  // Search (requires embedding in request body)
  app.post('/search', async (req: Request, res: Response) => {
    try {
      const { embedding, text, collection, limit, threshold, hybridWeight } = req.body;

      if (!embedding || !Array.isArray(embedding)) {
        res.status(400).json({ error: 'embedding array required' });
        return;
      }

      const options: SearchOptions = {
        collection,
        limit: limit || 10,
        threshold: threshold || 0,
        hybridWeight: hybridWeight ?? 0.7,
      };

      let results;
      if (text && hybridWeight < 1.0) {
        results = await search.hybridSearch(embedding, text, options);
      } else {
        results = await search.search(embedding, options);
      }

      res.json({
        results: results.map(r => ({
          id: r.chunk.id,
          text: r.chunk.text,
          score: r.score,
          vectorScore: r.vectorScore,
          keywordScore: r.keywordScore,
          sourceFile: r.chunk.sourceFile,
          chunkIndex: r.chunk.chunkIndex,
          metadata: r.chunk.metadata,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Simple GET search (for testing, limited functionality)
  app.get('/search', async (req: Request, res: Response) => {
    res.status(400).json({
      error: 'GET /search not supported. Use POST /search with embedding array.',
      hint: 'To search, POST { "embedding": [...], "text": "optional query", "collection": "name" }',
    });
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
    console.log(`🧠 Engram server running at http://${config.host}:${config.port}`);
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
