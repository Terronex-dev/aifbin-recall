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

## Installation

```bash
# npm
npm install -g @terronex/aifbin-recall

# bun
bun install -g @terronex/aifbin-recall
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
- `recall_search` — Semantic search across collections
- `recall_get` — Retrieve specific memories by ID
- `recall_collections` — List available collections
- `recall_index` — Add new files to a collection

## HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/search` | GET/POST | Semantic search with optional filters |
| `/recall/:id` | GET | Retrieve specific memory chunk |
| `/collections` | GET | List all collections |
| `/collections/:name` | POST | Create/update collection |
| `/index` | POST | Index directory of .aif-bin files |
| `/health` | GET | Server health check |

## Configuration

```yaml
# ~/.aifbin-recall/config.yaml
server:
  port: 3847
  host: localhost

index:
  path: ~/.aifbin-recall/index.db
  
search:
  default_limit: 10
  hybrid_weight: 0.7  # 0 = keywords only, 1 = vectors only
```

## How It Works

1. **Indexing**: AIF-BIN Recall reads `.aif-bin` files (created by [AIF-BIN Pro](https://github.com/Terronex-dev/aifbin-pro)) and extracts their embedded vectors and text chunks into a local SQLite database.

2. **Search**: Queries are embedded using the same model, then matched against indexed vectors using cosine similarity. Optional BM25 keyword matching provides hybrid retrieval.

3. **Retrieval**: Results include the original text, metadata, source file, and similarity scores — ready for RAG pipelines or direct AI consumption.

## Part of the AIF-BIN Ecosystem

- **[AIF-BIN](https://github.com/Terronex-dev/aifbin)** — Core specification and SDKs
- **[AIF-BIN Pro](https://github.com/Terronex-dev/aifbin-pro)** — CLI for creating .aif-bin files
- **AIF-BIN Recall** — Memory server for querying collections *(you are here)*

## License

MIT © 2026 Terronex

## Trademarks

"AIF-BIN", "AIF-BIN Recall", "AIF-BIN Pro", and the Terronex name are trademarks of Terronex. The MIT license does not grant permission to use these trademarks. See NOTICE file for details.
