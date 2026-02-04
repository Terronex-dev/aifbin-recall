#!/usr/bin/env node
/**
 * Engram CLI - Local-first memory server for AI agents
 */

import { Command } from 'commander';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { EngramDB } from './db.js';
import { SearchEngine } from './search.js';
import { Indexer } from './indexer.js';
import { startServer } from './server.js';
import { startMcpServer } from './mcp.js';
import { DEFAULT_CONFIG } from './types.js';

const program = new Command();

// Resolve default DB path
function getDefaultDbPath(): string {
  const configDir = path.join(os.homedir(), '.engram');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, 'index.db');
}

program
  .name('engram')
  .description('Local-first memory server for AI agents')
  .version('0.1.0')
  .option('-d, --db <path>', 'Database path', getDefaultDbPath());

// Index command
program
  .command('index <directory>')
  .description('Index AIF-BIN files from a directory')
  .option('-c, --collection <name>', 'Collection name', 'default')
  .option('-r, --recursive', 'Search subdirectories', true)
  .option('--no-recursive', 'Do not search subdirectories')
  .action((directory, options) => {
    const dbPath = program.opts().db;
    const db = new EngramDB(dbPath);
    const indexer = new Indexer(db);

    console.log(`Indexing ${directory} into collection "${options.collection}"...`);
    
    const result = indexer.indexDirectory(path.resolve(directory), {
      collection: options.collection,
      recursive: options.recursive,
    });

    console.log(`\n✅ Indexed ${result.files} files (${result.chunks} chunks)`);
    db.close();
  });

// Serve command
program
  .command('serve')
  .description('Start the HTTP server')
  .option('-p, --port <port>', 'Server port', String(DEFAULT_CONFIG.server.port))
  .option('-h, --host <host>', 'Server host', DEFAULT_CONFIG.server.host)
  .action((options) => {
    const dbPath = program.opts().db;
    const db = new EngramDB(dbPath);

    startServer({
      db,
      config: {
        port: parseInt(options.port, 10),
        host: options.host,
      },
    });
  });

// MCP command
program
  .command('mcp')
  .description('Start the MCP server for AI agent integration')
  .action(async () => {
    const dbPath = program.opts().db;
    const db = new EngramDB(dbPath);
    await startMcpServer(db);
  });

// Collections command
program
  .command('collections')
  .description('List all collections')
  .action(() => {
    const dbPath = program.opts().db;
    const db = new EngramDB(dbPath);
    const collections = db.listCollections();

    if (collections.length === 0) {
      console.log('No collections found. Use "engram index" to create one.');
    } else {
      console.log('Collections:\n');
      for (const col of collections) {
        console.log(`  ${col.name}`);
        console.log(`    Files: ${col.fileCount}`);
        console.log(`    Chunks: ${col.chunkCount}`);
        if (col.description) {
          console.log(`    Description: ${col.description}`);
        }
        console.log('');
      }
    }

    db.close();
  });

// Search command (basic, requires embedding file or stdin)
program
  .command('search <query>')
  .description('Search memories (note: requires embedding, mainly for testing)')
  .option('-c, --collection <name>', 'Collection to search')
  .option('-n, --limit <count>', 'Number of results', '10')
  .option('-e, --embedding <file>', 'JSON file containing query embedding')
  .action(async (query, options) => {
    const dbPath = program.opts().db;
    const db = new EngramDB(dbPath);
    const search = new SearchEngine(db);

    // For CLI testing, we need an embedding file
    if (!options.embedding) {
      console.log('Note: CLI search requires an embedding vector.');
      console.log('');
      console.log('Options:');
      console.log('  1. Use the HTTP API: POST /search with embedding');
      console.log('  2. Use MCP: AI agents can provide embeddings');
      console.log('  3. Provide embedding file: --embedding query.json');
      console.log('');
      console.log('Example embedding file format:');
      console.log('  { "embedding": [0.1, 0.2, ...] }');
      db.close();
      return;
    }

    try {
      const embeddingData = JSON.parse(fs.readFileSync(options.embedding, 'utf-8'));
      const embedding = embeddingData.embedding || embeddingData;

      if (!Array.isArray(embedding)) {
        console.error('Error: embedding must be an array');
        db.close();
        return;
      }

      const results = await search.hybridSearch(embedding, query, {
        collection: options.collection,
        limit: parseInt(options.limit, 10),
      });

      if (results.length === 0) {
        console.log('No results found.');
      } else {
        console.log(`Found ${results.length} results:\n`);
        for (const [i, r] of results.entries()) {
          console.log(`[${i + 1}] Score: ${r.score.toFixed(4)}`);
          console.log(`    Source: ${r.chunk.sourceFile}`);
          console.log(`    Text: ${r.chunk.text.slice(0, 200)}${r.chunk.text.length > 200 ? '...' : ''}`);
          console.log('');
        }
      }
    } catch (err) {
      console.error('Error:', err);
    }

    db.close();
  });

// Info command
program
  .command('info')
  .description('Show database information')
  .action(() => {
    const dbPath = program.opts().db;
    console.log(`Engram v0.1.0`);
    console.log(`Database: ${dbPath}`);
    console.log('');

    if (fs.existsSync(dbPath)) {
      const db = new EngramDB(dbPath);
      const collections = db.listCollections();
      const totalChunks = collections.reduce((sum, c) => sum + c.chunkCount, 0);
      const totalFiles = collections.reduce((sum, c) => sum + c.fileCount, 0);

      console.log(`Collections: ${collections.length}`);
      console.log(`Total files: ${totalFiles}`);
      console.log(`Total chunks: ${totalChunks}`);
      db.close();
    } else {
      console.log('Database not found. Run "engram index" to create one.');
    }
  });

program.parse();
