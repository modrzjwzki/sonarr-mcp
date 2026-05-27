# sonarr-mcp

MCP server exposing [Sonarr](https://sonarr.tv/) as tools for any MCP-compatible AI client — Claude Desktop, Claude Code, Cursor, Codex, or your own agent.

Talk to your TV library in natural language: *"add Severance and monitor only season 2"*, *"what's airing this week?"*, *"download the missing episodes of The Bear"*. The AI picks the right tools, chains them, and reports back.

## Features

- **31 tools** covering library, episodes, search, queue, releases, calendar, and stats
- **Per-season monitoring** — `add_series` accepts `monitoredSeasons: number[]`
- **Three-way search** — episode-level, season-level (season packs), or full series
- **Two transports**: stdio (default — local AI clients) and HTTP streamable (remote agents, docker-compose)
- **Stateless HTTP** — a fresh server instance per request, safe for concurrent calls

## Tools

### Library
| Tool | Purpose |
| --- | --- |
| `list_series` | All series in the library |
| `search_library` | Find series by title fragment |
| `get_series` | Full details for one series |
| `lookup_series` | TVDB lookup (before adding) |
| `add_series` | Add by TVDB id, pick seasons to monitor |
| `delete_series` | Remove series (optionally with files) |
| `refresh_series` | Refresh metadata from TVDB |
| `set_series_monitored` | Toggle monitoring on whole series |
| `set_season_monitored` | Toggle monitoring for one season |
| `set_episode_monitored` | Toggle monitoring per-episode |
| `change_quality` | Change quality profile |
| `set_series_tags` | Replace tags on a series |

### Episodes
| Tool | Purpose |
| --- | --- |
| `get_episodes` | Episodes for a series, optional season filter |
| `get_episode` | One episode by id |

### Search & download
| Tool | Purpose |
| --- | --- |
| `trigger_search` | Force search (series / season / episodes) |
| `search_episode_releases` | Releases for one episode (with built-in retry) |
| `search_season_releases` | Releases for a season (season packs) |
| `download_release` | Send release to download client |
| `get_queue` | Current download queue |
| `cancel_queue_item` | Remove from queue |

### Insights
| Tool | Purpose |
| --- | --- |
| `get_series_history` | History for a series |
| `get_missing_episodes` | Monitored episodes not yet downloaded |
| `get_wanted_cutoff` | Episodes below quality cutoff |
| `get_calendar` | Upcoming episodes |
| `get_collection_stats` | Aggregate library stats |

### System
| Tool | Purpose |
| --- | --- |
| `get_quality_profiles` | List quality profiles |
| `get_language_profiles` | List language profiles (older Sonarr versions) |
| `get_root_folders` | Root folders + free space |
| `get_tags` | List tags |
| `get_disk_space` | Disk space per volume |
| `get_system_status` | Sonarr system info |

## Setup

```bash
git clone https://github.com/<your-handle>/sonarr-mcp
cd sonarr-mcp
npm install
SONARR_URL=http://localhost:8989 SONARR_API_KEY=your-key npm start
```

Get your API key from Sonarr → Settings → General → Security.

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop. The `sonarr` server should appear in the tools menu.

## Claude Code

```bash
claude mcp add sonarr \
  -e SONARR_URL=http://localhost:8989 \
  -e SONARR_API_KEY=your-key \
  -- node /absolute/path/to/sonarr-mcp/src/index.js
```

## HTTP mode

For remote agents, docker-compose, or claude.ai remote MCPs:

```bash
MCP_TRANSPORT=http MCP_PORT=3001 \
  SONARR_URL=http://localhost:8989 \
  SONARR_API_KEY=your-key \
  npm start
```

Verify the handshake:

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

## Docker

The included `Dockerfile` runs HTTP mode on port 3001 (different from radarr's 3000 to avoid collision in docker-compose):

```bash
docker build -t sonarr-mcp .
docker run --rm -p 3001:3001 \
  -e SONARR_URL=http://sonarr:8989 \
  -e SONARR_API_KEY=your-key \
  sonarr-mcp
```

Or compose:

```yaml
services:
  sonarr-mcp:
    build: ./sonarr-mcp
    environment:
      SONARR_URL: http://sonarr:8989
      SONARR_API_KEY: ${SONARR_API_KEY}
    ports:
      - "3001:3001"
```

## Remote access via claude.ai

Run HTTP mode behind a reverse proxy (nginx, Caddy) or Cloudflare Tunnel, then register the public HTTPS endpoint as a remote MCP in claude.ai → Settings → Connectors.

## Configuration

| Env var | Required | Default | Description |
| --- | --- | --- | --- |
| `SONARR_URL` | yes | — | Base URL of your Sonarr instance |
| `SONARR_API_KEY` | yes | — | Sonarr API key |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `MCP_PORT` | no | `3001` | HTTP port (only when transport=http) |

## Notes

- Sonarr's external id is **TVDB**, not TMDB. `lookup_series` accepts either a TVDB id (`tvdb:12345`) or free text.
- Monitoring is per-season. When calling `add_series`, pass `monitoredSeasons: [2, 3]` to monitor only specific seasons; iterate the lookup response's `seasons` to see what's available.
- `trigger_search` accepts one of `seriesIds`, `{seriesId, seasonNumber}`, or `episodeIds` — it picks `SeriesSearch` / `SeasonSearch` / `EpisodeSearch` accordingly.

## Project layout

```
src/
  sonarr.js   ← thin Sonarr v3 REST client, no MCP concerns
  index.js    ← MCP server bootstrap, tool registration, transport selection
Dockerfile
package.json
```

Adding a tool: extend `SonarrClient` in `sonarr.js`, then register it inside `createServer()` in `index.js`.

## License

MIT
