/**
 * MCP (Model Context Protocol) server for AIF-BIN Recall
 * Enables AI agents to query semantic memories
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { EngramDB } from './db.js';
import { SearchEngine } from './search.js';
import { Indexer } from './indexer.js';
import { Embedder, type EmbeddingModelName } from './embedder.js';

export async function startMcpServer(db: EngramDB): Promise<void> {
  const search = new SearchEngine(db);
  const indexer = new Indexer(db);
  const embedder = new Embedder('minilm');

  const server = new Server(
    {
      name: 'aifbin-recall',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'recall_search',
          description: 'Search semantic memories using natural language. Automatically embeds your query text. Returns relevant text chunks with similarity scores.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query (will be embedded automatically)',
              },
              embedding: {
                type: 'array',
                items: { type: 'number' },
                description: 'Pre-computed query embedding vector (optional, query text is preferred)',
              },
              collection: {
                type: 'string',
                description: 'Collection name to search (optional, searches all if omitted)',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (default: 10)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'recall_get',
          description: 'Retrieve a specific memory chunk by ID',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Chunk ID to retrieve',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'recall_collections',
          description: 'List all available memory collections',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'recall_index',
          description: 'Index a directory of AIF-BIN files into a collection',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Directory path containing .aif-bin files',
              },
              collection: {
                type: 'string',
                description: 'Collection name to index into',
              },
              recursive: {
                type: 'boolean',
                description: 'Search subdirectories (default: true)',
              },
            },
            required: ['path', 'collection'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'recall_search': {
          const { embedding, query, collection, limit } = args as {
            embedding?: number[];
            query: string;
            collection?: string;
            limit?: number;
          };

          if (!query && (!embedding || !Array.isArray(embedding))) {
            return {
              content: [{ type: 'text', text: 'Error: query text required' }],
              isError: true,
            };
          }

          // Generate embedding from query text if not provided
          let queryEmbedding: number[];
          if (embedding && Array.isArray(embedding)) {
            queryEmbedding = embedding;
          } else {
            queryEmbedding = await embedder.embed(query);
          }

          const options = { collection, limit: limit || 10 };
          const results = await search.hybridSearch(queryEmbedding, query, options);

          const formatted = results.map((r, i) => 
            `[${i + 1}] Score: ${r.score.toFixed(3)}\n` +
            `    Source: ${r.chunk.sourceFile}\n` +
            `    Text: ${r.chunk.text.slice(0, 500)}${r.chunk.text.length > 500 ? '...' : ''}\n` +
            `    ID: ${r.chunk.id}`
          ).join('\n\n');

          return {
            content: [{
              type: 'text',
              text: results.length > 0 
                ? `Found ${results.length} results:\n\n${formatted}`
                : 'No results found.',
            }],
          };
        }

        case 'recall_get': {
          const { id } = args as { id: string };
          const chunk = search.recall(id);

          if (!chunk) {
            return {
              content: [{ type: 'text', text: `Chunk not found: ${id}` }],
              isError: true,
            };
          }

          return {
            content: [{
              type: 'text',
              text: `Source: ${chunk.sourceFile}\n` +
                    `Chunk: ${chunk.chunkIndex}\n` +
                    `Created: ${chunk.createdAt.toISOString()}\n\n` +
                    `Text:\n${chunk.text}`,
            }],
          };
        }

        case 'recall_collections': {
          const collections = db.listCollections();

          if (collections.length === 0) {
            return {
              content: [{ type: 'text', text: 'No collections found. Use recall_index to create one.' }],
            };
          }

          const formatted = collections.map(c =>
            `• ${c.name}: ${c.chunkCount} chunks from ${c.fileCount} files` +
            (c.description ? ` - ${c.description}` : '')
          ).join('\n');

          return {
            content: [{
              type: 'text',
              text: `Available collections:\n\n${formatted}`,
            }],
          };
        }

        case 'recall_index': {
          const { path: dirPath, collection, recursive } = args as {
            path: string;
            collection: string;
            recursive?: boolean;
          };

          const result = indexer.indexDirectory(dirPath, {
            collection,
            recursive: recursive !== false,
          });

          return {
            content: [{
              type: 'text',
              text: `Indexed ${result.files} files (${result.chunks} chunks) into collection "${collection}"`,
            }],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err}` }],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AIF-BIN Recall MCP server running');
}
