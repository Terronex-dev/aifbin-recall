# Claude Desktop + AIF-BIN Recall Setup

Give Claude persistent memory with semantic search over your personal knowledge base.

## Prerequisites

1. [Claude Desktop](https://claude.ai/download) installed
2. Node.js 18+ installed
3. AIF-BIN memory files (`.aif-bin`) in a directory

## Quick Setup

### 1. Install Recall globally (optional but recommended)

```bash
npm install -g @terronex-dev/aifbin-recall
```

### 2. Configure Claude Desktop

Find your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add the Recall MCP server:

```json
{
  "mcpServers": {
    "aifbin-recall": {
      "command": "npx",
      "args": ["@terronex-dev/aifbin-recall", "mcp"],
      "env": {
        "RECALL_DATA_DIR": "/path/to/your/memories"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Quit and reopen Claude Desktop. You should see "aifbin-recall" in the MCP servers list.

## Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `RECALL_DATA_DIR` | Directory containing `.aif-bin` files | `./data` |
| `RECALL_MODEL` | Embedding model to use | `Xenova/all-MiniLM-L6-v2` |
| `RECALL_TOP_K` | Number of results to return | `5` |
| `RECALL_MIN_SCORE` | Minimum similarity score | `0.5` |

## Available Tools

Once connected, Claude can use these tools:

### `recall_search`
Search your memory by meaning.

```
Query: "what did we decide about pricing?"
Returns: Relevant chunks with similarity scores
```

### `recall_stats`
Get statistics about your memory files.

```
Returns: Number of files, total chunks, index status
```

### `recall_list`
List all indexed memory files.

```
Returns: File names, sizes, chunk counts
```

## Creating Memory Files

You can create `.aif-bin` files using:

```bash
# From markdown files
npx @terronex-dev/aifbin-recall ingest ./notes --output ./memories

# From a directory of documents
npx @terronex-dev/aifbin-recall ingest ./documents --output ./memories
```

## Troubleshooting

### "MCP server not found"
- Make sure Node.js 18+ is installed
- Try installing globally: `npm install -g @terronex-dev/aifbin-recall`
- Check the path in your config

### "No results found"
- Verify `.aif-bin` files exist in `RECALL_DATA_DIR`
- Run `npx @terronex-dev/aifbin-recall index` to rebuild the index
- Try lowering `RECALL_MIN_SCORE`

### "Connection refused"
- Check if another instance is running
- Verify port 3000 is available

## Example Conversation

```
You: What were the key decisions from last week's meeting?

Claude: [Uses recall_search tool]

Based on your memories, here are the key decisions from last week:
1. Pricing set at $29/month for pro tier
2. Launch date moved to March 15
3. Focus on Obsidian integration first
...
```

## Privacy

- All data stays on your machine
- No cloud connection required
- Claude only sees what you put in your memory files

## Links

- [GitHub](https://github.com/terronexdev/aifbin-recall)
- [npm](https://www.npmjs.com/package/@terronex-dev/aifbin-recall)
- [Documentation](https://terronex.dev)
