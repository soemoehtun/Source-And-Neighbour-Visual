import type { CalculatedData, ColumnMapping, Dataset, Site } from "@/types";
import { haversine } from "./distance";

export interface LinkMapping {
  source: string;
  neighbor: string;
}

export function guessLinkMapping(columns: string[]): LinkMapping {
  const find = (pattern: RegExp) =>
    columns.find((column) => pattern.test(column.toLowerCase().replace(/[^a-z]/g, ""))) ?? "";
  return {
    source: find(/^(source|from)(site|cell|sector)?(id|name|code)?$/),
    neighbor: find(/^(neighbou?r|target|to)(site|cell|sector)?(id|name|code)?$/),
  };
}

export interface LinkImportReport {
  invalidSites: number;
  duplicateSites: number;
  invalidLinks: number;
  duplicateLinks: number;
  unmatchedLinks: number;
  unmatchedIds: string[];
}

function coordinate(value: string | number | null | undefined, bound: number): number | null {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(typeof value === "string" ? value.trim().replace(/°$/, "") : value);
  return Number.isFinite(number) && Math.abs(number) <= bound ? number : null;
}

export function importSiteLinks(
  siteData: Dataset,
  siteMapping: Pick<ColumnMapping, "id" | "lat" | "lng">,
  linkData: Dataset,
  linkMapping: LinkMapping,
): { data: CalculatedData; report: LinkImportReport } {
  const report: LinkImportReport = {
    invalidSites: 0, duplicateSites: 0, invalidLinks: 0, duplicateLinks: 0,
    unmatchedLinks: 0, unmatchedIds: [],
  };
  const sitesById = new Map<string, Site>();
  for (const row of siteData.rows) {
    const id = String(row[siteMapping.id] ?? "").trim();
    const lat = coordinate(row[siteMapping.lat], 90);
    const lng = coordinate(row[siteMapping.lng], 180);
    if (!id || lat === null || lng === null) {
      report.invalidSites++;
      continue;
    }
    if (sitesById.has(id)) {
      report.duplicateSites++;
      continue;
    }
    sitesById.set(id, { id, lat, lng, originalData: row, isSource: true });
  }

  const neighborsById = new Map<string, Map<string, number>>();
  const connections: CalculatedData["connections"] = [];
  const unmatchedIds = new Set<string>();
  for (const row of linkData.rows) {
    const from = String(row[linkMapping.source] ?? "").trim();
    const to = String(row[linkMapping.neighbor] ?? "").trim();
    if (!from || !to || from === to) {
      report.invalidLinks++;
      continue;
    }
    const source = sitesById.get(from);
    const neighbor = sitesById.get(to);
    if (!source || !neighbor) {
      report.unmatchedLinks++;
      if (!source && unmatchedIds.size < 5) unmatchedIds.add(from);
      if (!neighbor && unmatchedIds.size < 5) unmatchedIds.add(to);
      continue;
    }
    let neighbors = neighborsById.get(from);
    if (!neighbors) {
      neighbors = new Map();
      neighborsById.set(from, neighbors);
    }
    if (neighbors.has(to)) {
      report.duplicateLinks++;
      continue;
    }
    const distance = haversine(source.lat, source.lng, neighbor.lat, neighbor.lng);
    neighbors.set(to, distance);
    connections.push({ from, to, distance });
  }

  report.unmatchedIds = [...unmatchedIds];
  const allSites = [...sitesById.values()];
  const sitesWithNeighbors = allSites.map((site) => ({
    ...site,
    neighbors: Array.from(neighborsById.get(site.id) ?? [], ([to, dist]) => ({ to, dist })),
  }));
  return { data: { allSites, sitesWithNeighbors, connections }, report };
}
