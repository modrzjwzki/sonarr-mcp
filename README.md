# sonarr-mcp

MCP server that exposes [Sonarr](https://sonarr.tv/) as tools for any MCP-compatible AI agent (Claude Desktop, Claude Code, Cursor, OpenClaw, Codex, etc.).

Two transports:
- **stdio** (default) — for local clients like Claude Desktop / Claude Code / Cursor
- **HTTP streamable** — for remote clients and in-network agents (e.g. `arr-agent` in docker-compose)

Switch via `MCP_TRANSPORT=stdio|http` (default `stdio`).

## Tools

| Tool | Purpose |
| --- | --- |
| `list_series` | All series in the library |
| `search_library` | Find series by title fragment |
| `get_series` | Full details for one series |
| `lookup_series` | TVDB lookup (not yet added) |
| `add_series` | Add series by TVDB id (pick seasons to monitor) |
| `delete_series` | Remove series (optionally with files) |
| `set_series_monitored` | Toggle monitoring for whole series |
| `set_season_monitored` | Toggle monitoring for one season |
| `set_episode_monitored` | Toggle monitoring for episodes |
| `change_quality` | Change quality profile |
| `trigger_search` | Force search (series / season / episodes) |
| `get_episodes` | Episodes for a series, optional season filter |
| `get_episode` | One episode by id |
| `search_episode_releases` | Releases for one episode |
| `search_season_releases` | Releases for full season (season packs) |
| `download_release` | Send release to download client |
| `get_queue` | Current download queue |
| `cancel_queue_item` | Remove from queue |
| `get_series_history` | History entries for a series |
| `get_missing_episodes` | Monitored episodes not yet downloaded |
| `get_quality_profiles` | List quality profiles |
| `get_language_profiles` | List language profiles (older Sonarr) |
| `get_root_folders` | List root folders + free space |
| `get_tags` | List tags |
| `get_disk_space` | Disk space per volume |
| `get_system_status` | Sonarr system info |
| `get_collection_stats` | Aggregate library stats |

## Setup

```bash
npm install
cp .env.example .env
# fill in SONARR_URL and SONARR_API_KEY
npm start
```

## Use with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sonarr": {
      "command": "node",
      "args": ["/absolute/path/to/sonarr-mcp/src/index.js"],
      "env": {
        "SONARR_URL": "http://localhost:8989",
        "SONARR_API_KEY": "your-key"
      }
    }
  }
}
```

## Use with Claude Code

```bash
claude mcp add sonarr -e SONARR_URL=http://localhost:8989 -e SONARR_API_KEY=your-key -- node /absolute/path/to/sonarr-mcp/src/index.js
```

## HTTP mode

```bash
MCP_TRANSPORT=http MCP_PORT=3001 \
  SONARR_URL=http://localhost:8989 \
  SONARR_API_KEY=your-key \
  npm start
```

Verify handshake:

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

## Docker

Dockerfile defaults to HTTP mode on port 3001.

```bash
docker build -t sonarr-mcp .
docker run --rm -p 3001:3001 \
  -e SONARR_URL=http://sonarr:8989 \
  -e SONARR_API_KEY=your-key \
  sonarr-mcp
```

## Remote access (e.g. claude.ai)

Run in HTTP mode behind a reverse proxy / Cloudflare Tunnel and register the public HTTPS endpoint as a remote MCP in claude.ai.

## License

MIT
