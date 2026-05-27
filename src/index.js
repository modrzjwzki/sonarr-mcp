#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SonarrClient } from "./sonarr.js";

const SONARR_URL = process.env.SONARR_URL;
const SONARR_API_KEY = process.env.SONARR_API_KEY;
const TRANSPORT = process.env.MCP_TRANSPORT || "stdio";
const PORT = parseInt(process.env.MCP_PORT || "3001", 10);

if (!SONARR_URL || !SONARR_API_KEY) {
  console.error("Missing SONARR_URL or SONARR_API_KEY");
  process.exit(1);
}

const sonarr = new SonarrClient(SONARR_URL, SONARR_API_KEY);

const toGb = (bytes) => (bytes ? (bytes / 1073741824).toFixed(2) : "0");

const seriesSummary = (s) => ({
  id: s.id,
  tvdbId: s.tvdbId,
  imdbId: s.imdbId,
  title: s.title,
  year: s.year,
  status: s.status,
  monitored: s.monitored,
  qualityProfileId: s.qualityProfileId,
  languageProfileId: s.languageProfileId,
  genres: s.genres || [],
  network: s.network,
  added: s.added,
  path: s.path,
  seasons: (s.seasons || []).map((x) => ({
    seasonNumber: x.seasonNumber,
    monitored: x.monitored,
    episodeFileCount: x.statistics?.episodeFileCount,
    episodeCount: x.statistics?.episodeCount,
    totalEpisodeCount: x.statistics?.totalEpisodeCount,
    sizeGb: toGb(x.statistics?.sizeOnDisk),
  })),
  totalEpisodes: s.statistics?.totalEpisodeCount,
  episodeFileCount: s.statistics?.episodeFileCount,
  sizeGb: toGb(s.statistics?.sizeOnDisk),
});

const episodeSummary = (e) => ({
  id: e.id,
  seriesId: e.seriesId,
  seasonNumber: e.seasonNumber,
  episodeNumber: e.episodeNumber,
  title: e.title,
  airDateUtc: e.airDateUtc,
  hasFile: e.hasFile,
  monitored: e.monitored,
  episodeFileId: e.episodeFileId,
});

const ok = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

function createServer() {
  const server = new McpServer({
    name: "sonarr-mcp",
    version: "0.1.0",
  });

server.tool(
  "list_series",
  "List all series in the Sonarr library with id, title, status, seasons, sizes",
  {},
  async () => {
    const series = await sonarr.getAllSeries();
    return ok(series.map(seriesSummary));
  }
);

server.tool(
  "search_library",
  "Search the Sonarr library for series matching a title query",
  { query: z.string().describe("Title fragment to search for") },
  async ({ query }) => {
    const series = await sonarr.findSeriesByTitle(query);
    return ok(series.map(seriesSummary));
  }
);

server.tool(
  "get_series",
  "Get full details for a single series by Sonarr id",
  { seriesId: z.number().int() },
  async ({ seriesId }) => ok(await sonarr.getSeries(seriesId))
);

server.tool(
  "lookup_series",
  "Look up a series on TVDB (via Sonarr) by free text term. Returns candidates with tvdbId. Not yet added to library.",
  { term: z.string().describe("Free text query, e.g. series title or 'tvdb:81189'") },
  async ({ term }) => {
    const results = await sonarr.lookupSeries(term);
    return ok(
      (results || []).map((s) => ({
        tvdbId: s.tvdbId,
        title: s.title,
        year: s.year,
        overview: s.overview,
        status: s.status,
        network: s.network,
        genres: s.genres,
        runtime: s.runtime,
        seasonCount: (s.seasons || []).length,
        ratings: s.ratings,
        posterUrl: s.images?.find((i) => i.coverType === "poster")?.remoteUrl,
      }))
    );
  }
);

server.tool(
  "add_series",
  "Add a series to Sonarr by TVDB id. Requires qualityProfileId and rootFolderPath. Use monitoredSeasons to pick which seasons to monitor.",
  {
    tvdbId: z.number().int(),
    qualityProfileId: z.number().int(),
    languageProfileId: z.number().int().optional(),
    rootFolderPath: z.string().describe("Absolute path, e.g. /data/TV"),
    monitoredSeasons: z.array(z.number().int()).optional().default([]),
    seasonFolder: z.boolean().optional().default(true),
    monitored: z.boolean().optional().default(true),
    searchOnAdd: z.boolean().optional().default(false),
    tags: z.array(z.number().int()).optional().default([]),
  },
  async (args) => ok(await sonarr.addSeries(args))
);

server.tool(
  "delete_series",
  "Delete a series from Sonarr. Optionally remove files from disk.",
  {
    seriesId: z.number().int(),
    deleteFiles: z.boolean().optional().default(false),
    addImportListExclusion: z.boolean().optional().default(false),
  },
  async ({ seriesId, deleteFiles, addImportListExclusion }) =>
    ok(await sonarr.deleteSeries(seriesId, deleteFiles, addImportListExclusion))
);

server.tool(
  "set_series_monitored",
  "Toggle monitoring for an entire series",
  { seriesId: z.number().int(), monitored: z.boolean() },
  async ({ seriesId, monitored }) =>
    ok(await sonarr.setSeriesMonitored(seriesId, monitored))
);

server.tool(
  "set_season_monitored",
  "Toggle monitoring for a single season",
  {
    seriesId: z.number().int(),
    seasonNumber: z.number().int(),
    monitored: z.boolean(),
  },
  async ({ seriesId, seasonNumber, monitored }) =>
    ok(await sonarr.setSeasonMonitored(seriesId, seasonNumber, monitored))
);

server.tool(
  "set_episode_monitored",
  "Toggle monitoring for one or more episodes by id",
  {
    episodeIds: z.array(z.number().int()).min(1),
    monitored: z.boolean(),
  },
  async ({ episodeIds, monitored }) =>
    ok(await sonarr.setEpisodeMonitored(episodeIds, monitored))
);

server.tool(
  "change_quality",
  "Change the quality profile of a series",
  { seriesId: z.number().int(), qualityProfileId: z.number().int() },
  async ({ seriesId, qualityProfileId }) =>
    ok(await sonarr.changeQuality(seriesId, qualityProfileId))
);

server.tool(
  "trigger_search",
  "Trigger an indexer search. Provide exactly one of: seriesIds, {seriesId, seasonNumber}, or episodeIds.",
  {
    seriesIds: z.array(z.number().int()).optional(),
    seriesId: z.number().int().optional(),
    seasonNumber: z.number().int().optional(),
    episodeIds: z.array(z.number().int()).optional(),
  },
  async ({ seriesIds, seriesId, seasonNumber, episodeIds }) => {
    if (episodeIds?.length) return ok(await sonarr.triggerEpisodeSearch(episodeIds));
    if (seriesId !== undefined && seasonNumber !== undefined)
      return ok(await sonarr.triggerSeasonSearch(seriesId, seasonNumber));
    if (seriesIds?.length) return ok(await sonarr.triggerSeriesSearch(seriesIds));
    return {
      isError: true,
      content: [{ type: "text", text: "Provide seriesIds, {seriesId+seasonNumber}, or episodeIds" }],
    };
  }
);

server.tool(
  "get_episodes",
  "Get episodes for a series, optionally filtered by season",
  {
    seriesId: z.number().int(),
    seasonNumber: z.number().int().optional(),
  },
  async ({ seriesId, seasonNumber }) => {
    const eps = await sonarr.getEpisodes(seriesId, seasonNumber);
    return ok(eps.map(episodeSummary));
  }
);

server.tool(
  "get_episode",
  "Get a single episode by id",
  { episodeId: z.number().int() },
  async ({ episodeId }) => ok(await sonarr.getEpisode(episodeId))
);

server.tool(
  "search_episode_releases",
  "Search available releases for one episode. Returns guid, indexerId, quality, size, seeders.",
  { episodeId: z.number().int() },
  async ({ episodeId }) => {
    const releases = await sonarr.searchEpisodeReleases(episodeId);
    return ok(
      releases.map((r, i) => ({
        index: i,
        guid: r.guid,
        indexerId: r.indexerId,
        title: r.title,
        quality: r.quality?.quality?.name,
        sizeGb: toGb(r.size),
        seeders: r.seeders,
        leechers: r.leechers,
        protocol: r.protocol,
        rejected: r.rejected,
        rejections: r.rejections,
        fullSeason: r.fullSeason,
      }))
    );
  }
);

server.tool(
  "search_season_releases",
  "Search available releases for an entire season (season packs)",
  {
    seriesId: z.number().int(),
    seasonNumber: z.number().int(),
  },
  async ({ seriesId, seasonNumber }) => {
    const releases = await sonarr.searchSeasonReleases(seriesId, seasonNumber);
    return ok(
      releases.map((r, i) => ({
        index: i,
        guid: r.guid,
        indexerId: r.indexerId,
        title: r.title,
        quality: r.quality?.quality?.name,
        sizeGb: toGb(r.size),
        seeders: r.seeders,
        leechers: r.leechers,
        protocol: r.protocol,
        rejected: r.rejected,
        rejections: r.rejections,
        fullSeason: r.fullSeason,
      }))
    );
  }
);

server.tool(
  "download_release",
  "Send a release to the download client. Use guid + indexerId from a search_*_releases call.",
  {
    guid: z.string(),
    indexerId: z.number().int(),
  },
  async ({ guid, indexerId }) => ok(await sonarr.downloadRelease(guid, indexerId))
);

server.tool(
  "get_queue",
  "Get the current Sonarr download queue",
  {},
  async () => {
    const q = await sonarr.getQueue();
    return ok({
      total: q.totalRecords,
      records: (q.records || []).map((r) => ({
        id: r.id,
        seriesId: r.seriesId,
        episodeId: r.episodeId,
        seriesTitle: r.series?.title,
        episodeTitle: r.episode?.title,
        seasonNumber: r.episode?.seasonNumber,
        episodeNumber: r.episode?.episodeNumber,
        status: r.status,
        sizeGb: toGb(r.size),
        sizeLeftGb: toGb(r.sizeleft),
        timeLeft: r.timeleft,
        protocol: r.protocol,
        downloadClient: r.downloadClient,
      })),
    });
  }
);

server.tool(
  "cancel_queue_item",
  "Remove an item from the download queue",
  {
    queueId: z.number().int(),
    removeFromClient: z.boolean().optional().default(true),
    blocklist: z.boolean().optional().default(false),
  },
  async ({ queueId, removeFromClient, blocklist }) =>
    ok(await sonarr.cancelQueueItem(queueId, removeFromClient, blocklist))
);

server.tool(
  "get_series_history",
  "Get history entries (grabbed/imported/deleted/failed) for a series",
  {
    seriesId: z.number().int(),
    pageSize: z.number().int().optional().default(50),
  },
  async ({ seriesId, pageSize }) => {
    const h = await sonarr.getSeriesHistory(seriesId, pageSize);
    return ok({
      total: h.totalRecords,
      records: (h.records || []).map((r) => ({
        id: r.id,
        date: r.date,
        eventType: r.eventType,
        sourceTitle: r.sourceTitle,
        episodeId: r.episodeId,
        seriesId: r.seriesId,
      })),
    });
  }
);

server.tool(
  "get_missing_episodes",
  "List monitored episodes that are missing (not downloaded). Sorted by air date descending.",
  { count: z.number().int().optional().default(20) },
  async ({ count }) => {
    const missing = await sonarr.getMissingEpisodes(count);
    return ok({
      total: missing.totalRecords,
      records: (missing.records || []).map((e) => ({
        episodeId: e.id,
        seriesId: e.seriesId,
        seriesTitle: e.series?.title,
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
        title: e.title,
        airDateUtc: e.airDateUtc,
      })),
    });
  }
);

server.tool(
  "get_quality_profiles",
  "List configured Sonarr quality profiles (id + name)",
  {},
  async () => {
    const profiles = await sonarr.getQualityProfiles();
    return ok(profiles.map((p) => ({ id: p.id, name: p.name })));
  }
);

server.tool(
  "get_language_profiles",
  "List configured Sonarr language profiles (id + name). May be empty on newer Sonarr versions.",
  {},
  async () => {
    try {
      const profiles = await sonarr.getLanguageProfiles();
      return ok(profiles.map((p) => ({ id: p.id, name: p.name })));
    } catch (e) {
      return ok({ unavailable: true, reason: e.message });
    }
  }
);

server.tool(
  "get_root_folders",
  "List configured Sonarr root folders (path + free space)",
  {},
  async () => {
    const folders = await sonarr.getRootFolders();
    return ok(
      folders.map((f) => ({
        id: f.id,
        path: f.path,
        accessible: f.accessible,
        freeSpaceGb: toGb(f.freeSpace),
      }))
    );
  }
);

server.tool(
  "get_tags",
  "List configured Sonarr tags (id + label)",
  {},
  async () => ok(await sonarr.getTags())
);

server.tool(
  "get_disk_space",
  "Get Sonarr-reported disk space for all mounted volumes",
  {},
  async () => {
    const disks = await sonarr.getDiskSpace();
    return ok(
      disks.map((d) => ({
        path: d.path,
        label: d.label,
        freeSpaceGb: toGb(d.freeSpace),
        totalSpaceGb: toGb(d.totalSpace),
      }))
    );
  }
);

server.tool(
  "get_system_status",
  "Get Sonarr system status (version, build, runtime info)",
  {},
  async () => ok(await sonarr.getSystemStatus())
);

server.tool(
  "get_collection_stats",
  "Aggregate stats over the entire Sonarr library",
  {},
  async () => {
    const series = await sonarr.getAllSeries();
    let totalEpisodes = 0;
    let downloadedEpisodes = 0;
    let totalSize = 0;
    for (const s of series) {
      totalEpisodes += s.statistics?.totalEpisodeCount || 0;
      downloadedEpisodes += s.statistics?.episodeFileCount || 0;
      totalSize += s.statistics?.sizeOnDisk || 0;
    }
    const genreCount = {};
    for (const s of series) {
      for (const g of s.genres || []) genreCount[g] = (genreCount[g] || 0) + 1;
    }
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    return ok({
      totalSeries: series.length,
      totalEpisodes,
      downloadedEpisodes,
      missingEpisodes: totalEpisodes - downloadedEpisodes,
      totalSizeGb: toGb(totalSize),
      topGenres,
    });
  }
);

  return server;
}

if (TRANSPORT === "http") {
  const { default: express } = await import("express");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[sonarr-mcp http]", e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });

  const methodNotAllowed = (_req, res) =>
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.listen(PORT, () =>
    console.error(`[sonarr-mcp] http on :${PORT}/mcp`)
  );
} else {
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error("[sonarr-mcp] connected via stdio");
}
