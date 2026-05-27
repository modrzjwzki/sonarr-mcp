# sonarr-mcp — Claude guidance

MCP server that exposes Sonarr as tools. Standalone repo, also consumed by `../arr-agent/` over HTTP in the arr-stack docker-compose.

See `../ARCHITECTURE.md` for the bigger picture.

## Code map

- `src/sonarr.js` — thin Sonarr v3 REST client (`SonarrClient`). No MCP concerns.
- `src/index.js` — bootstrap. `createServer()` registers all tools on a fresh `McpServer`. Bottom branch chooses stdio (default) or HTTP transport from `MCP_TRANSPORT` env.

## Invariants

- **stdio must keep working.** It's the default for local AI clients (Claude Desktop, Cursor). Never make HTTP a hard requirement.
- **One `createServer()` per HTTP request.** Stateless mode — don't share a single McpServer instance across HTTP requests.
- **Sonarr's external id is TVDB, not TMDB.** Don't confuse with `radarr-mcp`. Lookup uses `?term=tvdb:{id}` or free text.
- **Monitoring is per-season.** `add_series` accepts `monitoredSeasons: number[]`; iterate over the lookup response's `seasons` to flip `monitored`.
- **Search has three flavors.** `trigger_search` accepts one of `seriesIds`, `{seriesId, seasonNumber}`, or `episodeIds` — picks the right command (`SeriesSearch` / `SeasonSearch` / `EpisodeSearch`).

## Adding a tool

1. Add the method to `SonarrClient` in `src/sonarr.js`.
2. Add `server.tool(name, description, zodSchema, handler)` inside `createServer()` in `src/index.js`. Return via `ok({...})`.
3. Mention it in the README tools table.

## Env

- `SONARR_URL`, `SONARR_API_KEY` — required.
- `MCP_TRANSPORT=stdio|http` (default `stdio`).
- `MCP_PORT` (default `3001` for HTTP — note: different from radarr's 3000 to avoid collision in docker-compose).

## Smoke test

```bash
# stdio
SONARR_URL=http://x SONARR_API_KEY=y node -e "import('./src/index.js').then(()=>setTimeout(()=>process.exit(0),500))"

# http
MCP_TRANSPORT=http MCP_PORT=3001 SONARR_URL=http://x SONARR_API_KEY=y node src/index.js
```
