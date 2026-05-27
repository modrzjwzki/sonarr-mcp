export class SonarrClient {
  constructor(url, apiKey) {
    this.url = url.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async _fetch(path, options = {}) {
    const res = await fetch(`${this.url}/api/v3${path}`, {
      ...options,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sonarr ${path} failed (${res.status}): ${text}`);
    }
    if (options.method === "DELETE") return null;
    return res.json();
  }

  async getQualityProfiles() {
    return this._fetch("/qualityprofile");
  }

  async getLanguageProfiles() {
    return this._fetch("/languageprofile");
  }

  async getTags() {
    return this._fetch("/tag");
  }

  async getRootFolders() {
    return this._fetch("/rootfolder");
  }

  async getAllSeries() {
    return this._fetch("/series");
  }

  async getSeries(seriesId) {
    return this._fetch(`/series/${seriesId}`);
  }

  async getSeriesByTvdb(tvdbId) {
    const series = await this.getAllSeries();
    return series.find((s) => s.tvdbId === tvdbId);
  }

  async findSeriesByTitle(query) {
    const series = await this.getAllSeries();
    const q = query.toLowerCase();
    return series.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.sortTitle?.toLowerCase().includes(q)
    );
  }

  async lookupSeries(term) {
    return this._fetch(`/series/lookup?term=${encodeURIComponent(term)}`);
  }

  async addSeries({
    tvdbId,
    qualityProfileId,
    languageProfileId,
    rootFolderPath,
    monitoredSeasons = [],
    seasonFolder = true,
    monitored = true,
    searchOnAdd = false,
    tags = [],
  }) {
    const existing = await this.getSeriesByTvdb(tvdbId);
    if (existing) return { alreadyExists: true, series: existing };

    const results = await this.lookupSeries(`tvdb:${tvdbId}`);
    const seriesData = results?.[0];
    if (!seriesData) throw new Error(`Series tvdb:${tvdbId} not found`);

    if (seriesData.seasons) {
      for (const season of seriesData.seasons) {
        season.monitored = monitoredSeasons.includes(season.seasonNumber);
      }
    }

    const payload = {
      ...seriesData,
      qualityProfileId,
      ...(languageProfileId !== undefined && { languageProfileId }),
      rootFolderPath,
      seasonFolder,
      monitored,
      tags,
      addOptions: {
        searchForMissingEpisodes: searchOnAdd,
        searchForCutoffUnmetEpisodes: false,
      },
    };

    const result = await this._fetch("/series", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { alreadyExists: false, series: result };
  }

  async updateSeries(series) {
    return this._fetch(`/series/${series.id}`, {
      method: "PUT",
      body: JSON.stringify(series),
    });
  }

  async deleteSeries(seriesId, deleteFiles = false, addImportListExclusion = false) {
    return this._fetch(
      `/series/${seriesId}?deleteFiles=${deleteFiles}&addImportListExclusion=${addImportListExclusion}`,
      { method: "DELETE" }
    );
  }

  async setSeriesMonitored(seriesId, monitored) {
    const series = await this.getSeries(seriesId);
    series.monitored = monitored;
    return this.updateSeries(series);
  }

  async setSeasonMonitored(seriesId, seasonNumber, monitored) {
    const series = await this.getSeries(seriesId);
    const season = series.seasons?.find((s) => s.seasonNumber === seasonNumber);
    if (!season) throw new Error(`Season ${seasonNumber} does not exist`);
    season.monitored = monitored;
    return this.updateSeries(series);
  }

  async changeQuality(seriesId, qualityProfileId) {
    const series = await this.getSeries(seriesId);
    series.qualityProfileId = qualityProfileId;
    return this.updateSeries(series);
  }

  async getEpisodes(seriesId, seasonNumber) {
    let path = `/episode?seriesId=${seriesId}`;
    if (seasonNumber !== undefined) path += `&seasonNumber=${seasonNumber}`;
    return this._fetch(path);
  }

  async getEpisode(episodeId) {
    return this._fetch(`/episode/${episodeId}`);
  }

  async setEpisodeMonitored(episodeIds, monitored) {
    return this._fetch("/episode/monitor", {
      method: "PUT",
      body: JSON.stringify({ episodeIds, monitored }),
    });
  }

  async triggerSeriesSearch(seriesIds) {
    return this._fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "SeriesSearch", seriesIds }),
    });
  }

  async triggerSeasonSearch(seriesId, seasonNumber) {
    return this._fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "SeasonSearch", seriesId, seasonNumber }),
    });
  }

  async triggerEpisodeSearch(episodeIds) {
    return this._fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "EpisodeSearch", episodeIds }),
    });
  }

  async searchEpisodeReleases(episodeId) {
    return this._fetch(`/release?episodeId=${episodeId}`);
  }

  async searchSeasonReleases(seriesId, seasonNumber) {
    return this._fetch(`/release?seriesId=${seriesId}&seasonNumber=${seasonNumber}`);
  }

  async downloadRelease(guid, indexerId) {
    return this._fetch("/release", {
      method: "POST",
      body: JSON.stringify({ guid, indexerId }),
    });
  }

  async getQueue() {
    return this._fetch("/queue?pageSize=50&includeUnknownSeriesItems=true&includeSeries=true&includeEpisode=true");
  }

  async cancelQueueItem(queueId, removeFromClient = true, blocklist = false) {
    return this._fetch(
      `/queue/${queueId}?removeFromClient=${removeFromClient}&blocklist=${blocklist}`,
      { method: "DELETE" }
    );
  }

  async getSeriesHistory(seriesId, pageSize = 50) {
    return this._fetch(`/history?seriesId=${seriesId}&pageSize=${pageSize}`);
  }

  async getMissingEpisodes(count = 20) {
    return this._fetch(
      `/wanted/missing?pageSize=${count}&sortKey=airDateUtc&sortDirection=descending&includeSeries=true`
    );
  }

  async getCalendar(start, end) {
    let path = "/calendar";
    const params = [];
    if (start) params.push(`start=${encodeURIComponent(start)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (params.length) path += `?${params.join("&")}`;
    return this._fetch(path);
  }

  async getWantedCutoff(pageSize = 50) {
    return this._fetch(`/wanted/cutoff?pageSize=${pageSize}&sortKey=title&sortDirection=ascending`);
  }

  async refreshSeries(seriesId) {
    const body = seriesId
      ? { name: "RefreshSeries", seriesId }
      : { name: "RefreshSeries" };
    return this._fetch("/command", { method: "POST", body: JSON.stringify(body) });
  }

  async getDiskSpace() {
    return this._fetch("/diskspace");
  }

  async getSystemStatus() {
    return this._fetch("/system/status");
  }

  async setSeriesTags(seriesId, tags, mode = "set") {
    const series = await this.getSeries(seriesId);
    if (mode === "set") series.tags = tags;
    else if (mode === "add") series.tags = [...new Set([...(series.tags || []), ...tags])];
    else if (mode === "remove") series.tags = (series.tags || []).filter((t) => !tags.includes(t));
    return this.updateSeries(series);
  }
}
