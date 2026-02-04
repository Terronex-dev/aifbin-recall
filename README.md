# AIF-BIN Recall

**Local-first memory server for AI agents.**

AIF-BIN Recall indexes collections of [AIF-BIN](https://github.com/Terronex-dev/aifbin) semantic memory files and provides fast retrieval via HTTP API and MCP (Model Context Protocol) for AI agent integration.

## Features

- **Semantic Search** — Query memories by meaning using embedded vectors
- **Hybrid Retrieval** — Combine vector similarity with keyword matching
- **MCP Server** — Native integration with AI agents (Claude, OpenClaw, etc.)
- **HTTP API** — RESTful endpoints for any client
- **Zero Cloud** — Fully local, no external services required
- **Collection Management** — Organize memories into logical groups

## Requirements

- Node.js 18+ or Bun 1.0+
- npm, yarn, or pnpm

## Installation

### Linux / macOS

```bash
# Using npm (recommended)
npm install -g @terronex/aifbin-recall

# Using Bun
bun install -g @terronex/aifbin-recall

# Using yarn
yarn global add @terronex/aifbin-recall

# Using pnpm
pnpm add -g @terronex/aifbin-recall
```

### Windows

```powershell
# Using npm (recommended)
npm install -g @terronex/aifbin-recall

# Using yarn
yarn global add @terronex/aifbin-recall

# Using pnpm
pnpm add -g @terronex/aifbin-recall
```

### From Source

```bash
git clone https://github.com/Terronex-dev/aifbin-recall.git
cd aifbin-recall
npm install
npm run build
npm link
```

### Verify Installation

```bash
aifbin-recall --version
# Output: 0.1.0
```

## Quick Start

```bash
# Index a directory of .aif-bin files
aifbin-recall index ./memories --collection my-project

# Start the server
aifbin-recall serve

# Search via CLI
aifbin-recall search "what decisions did we make about the API?"

# Or query the HTTP API
curl "http://localhost:3847/search?q=API+decisions&collection=my-project"
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `aifbin-recall index <dir>` | Index .aif-bin files from a directory |
| `aifbin-recall serve` | Start the HTTP server |
| `aifbin-recall mcp` | Start the MCP server for AI agents |
| `aifbin-recall search <query>` | Search memories via CLI |
| `aifbin-recall collections` | List all collections |
| `aifbin-recall info` | Show database information |

### Index Options

```bash
aifbin-recall index ./memories \
  --collection my-project \
  --recursive \
  --db ~/.aifbin-recall/custom.db
```

### Serve Options

```bash
aifbin-recall serve \
  --port 3847 \
  --host 0.0.0.0
```

### Search Options

```bash
aifbin-recall search "your query" \
  --collection my-project \
  --limit 10 \
  --model minilm
```

## MCP Integration

Add AIF-BIN Recall to your AI agent's MCP config:

```json
{
  "mcpServers": {
    "aifbin-recall": {
      "command": "aifbin-recall",
      "args": ["mcp"]
    }
  }
}
```

Available MCP tools:

| Tool | Description |
|------|-------------|
| `recall_search` | Semantic search across collections |
| `recall_get` | Retrieve specific memories by ID |
| `recall_collections` | List available collections |
| `recall_index` | Add new files to a collection |

## HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/search` | GET/POST | Semantic search with optional filters |
| `/recall/:id` | GET | Retrieve specific memory chunk |
| `/collections` | GET | List all collections |
| `/collections/:name` | POST | Create/update collection |
| `/index` | POST | Index directory of .aif-bin files |
| `/health` | GET | Server health check |

### Search Request

```bash
# GET request
curl "http://localhost:3847/search?q=your+query&collection=my-project&limit=10"

# POST request with options
curl -X POST http://localhost:3847/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your query", "collection": "my-project", "limit": 10}'
```

### Search Response

```json
{
  "results": [
    {
      "id": "chunk-uuid",
      "text": "The matched text content...",
      "score": 0.89,
      "vectorScore": 0.92,
      "keywordScore": 0.85,
      "sourceFile": "/path/to/file.aif-bin",
      "chunkIndex": 0,
      "metadata": {}
    }
  ]
}
```

## Configuration

Configuration file location: `~/.aifbin-recall/config.yaml`

```yaml
server:
  port: 3847
  host: localhost

index:
  path: ~/.aifbin-recall/index.db
  
search:
  default_limit: 10
  hybrid_weight: 0.7  # 0 = keywords only, 1 = vectors only

embedding:
  model: minilm  # Options: minilm, mpnet, bge-small, bge-base, e5-small
```

## Embedding Models

AIF-BIN Recall uses local sentence-transformer models for query embedding:

| Model | Dimensions | Speed | Quality |
|-------|-----------|-------|---------|
| `minilm` | 384 | Fastest | Good (default) |
| `mpnet` | 768 | Medium | Better |
| `bge-small` | 384 | Fast | Good |
| `bge-base` | 768 | Slower | Best |
| `e5-small` | 384 | Fast | Good |

Models are downloaded automatically on first use and cached locally.

## How It Works

1. **Indexing**: AIF-BIN Recall reads `.aif-bin` files (created by [AIF-BIN Pro](https://github.com/Terronex-dev/aifbin-pro)) and extracts their embedded vectors and text chunks into a local SQLite database.

2. **Search**: Queries are embedded using the same model, then matched against indexed vectors using cosine similarity. Optional BM25 keyword matching provides hybrid retrieval.

3. **Retrieval**: Results include the original text, metadata, source file, and similarity scores — ready for RAG pipelines or direct AI consumption.

## Part of the AIF-BIN Ecosystem

| Product | Description |
|---------|-------------|
| [AIF-BIN](https://github.com/Terronex-dev/aifbin) | Core specification and SDKs (Python, TypeScript, Rust, Go, C#, Java, Swift, Kotlin) |
| [AIF-BIN Lite](https://github.com/Terronex-dev/aifbin-lite) | Free CLI for basic .aif-bin file operations |
| [AIF-BIN Pro](https://github.com/Terronex-dev/aifbin-pro) | Professional CLI with AI extraction and batch processing |
| [AIF-BIN Recall](https://github.com/Terronex-dev/aifbin-recall) | Memory server for querying collections (you are here) |
| [Bot-BIN](https://github.com/Terronex-dev/bot-bin) | Persistent memory for AI chatbots |

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

## License

MIT © 2026 Terronex

## Trademarks

"AIF-BIN", "AIF-BIN Recall", "AIF-BIN Pro", and the Terronex name are trademarks of Terronex. The MIT license does not grant permission to use these trademarks. See NOTICE file for details.
