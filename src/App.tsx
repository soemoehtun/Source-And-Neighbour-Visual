import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalculatedData, ColumnMapping, Connection, Dataset, Site } from "@/types";
import { PALETTE } from "@/types";
import { parseFile, parseFileSheet } from "@/lib/parse";
import { exportKmzFile } from "@/lib/export";
import MapView from "@/components/MapView";
import { guessLinkMapping, importSiteLinks, type LinkMapping } from "@/lib/siteLinks";

/* ------------------------------------------------------------------ icons */
const I = {
  Menu: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),

  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),

  Columns: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),

  Style: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  ),

  Filter: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),

  Search: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),

  X: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),

  Export: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),


  Trash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),

  Sheet: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  ),

  Cloud: () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  ),


  SectorBeam: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20L4.5 7a10 10 0 0 1 15 0z" fill="currentColor" fillOpacity="0.15" />
      <path d="M12 20L4.5 7" />
      <path d="M12 20L19.5 7" />
      <path d="M4.5 7a10 10 0 0 1 15 0" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />
    </svg>
  ),

  FaceToFace: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h6M6 9l3 3-3 3" />
      <path d="M21 12h-6M18 9l-3 3 3 3" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" />
      <circle cx="21.5" cy="12" r="1" fill="currentColor" />
    </svg>
  ),


};

/* ------------------------------------------------------------------ setup */
type Tab = "upload" | "columns" | "style" | "filter";
type FileKind = "source" | "neighbors";
type SiteMapping = Pick<ColumnMapping, "id" | "lat" | "lng">;

const TABS: { id: Tab; label: string; Icon: () => React.ReactElement }[] = [
  { id: "upload", label: "File Input", Icon: I.Upload },
  { id: "columns", label: "Fields", Icon: I.Columns },
  { id: "style", label: "Style", Icon: I.Style },
  { id: "filter", label: "Export", Icon: I.Filter },
];

const EMPTY_MAPPING: SiteMapping = { id: "", lat: "", lng: "" };
const EMPTY_POPUP_COLUMNS = new Set<string>();
const NO_CONNECTIONS: Connection[] = [];

function distinctColumns(dataset: Dataset, keys: string[]): boolean {
  return new Set(keys).size === keys.length && keys.every((key) => dataset.columns.includes(key));
}
const EMPTY_RESULTS: CalculatedData = { sitesWithNeighbors: [], allSites: [], connections: [] };

const MAP_FIELDS: { key: keyof SiteMapping; label: string; hint: string }[] = [
  { key: "id", label: "Site ID", hint: "unique identifier" },
  { key: "lat", label: "Latitude", hint: "WGS84 · -90 to 90" },
  { key: "lng", label: "Longitude", hint: "WGS84 · -180 to 180" },
];

function guessMapping(columns: string[]): SiteMapping {
  return {
    id:
      columns.find((c) => /^(site(\s*|_)?(name|id|code)?|name|id|code|cell(\s*|_)?(name|id|code)?|sector(\s*|_)?(name|id|code)?)$/i.test(c.trim())) ??
      columns.find((c) => /id|site|name|code|cell|sector/i.test(c.trim())) ??
      columns[0] ??
      "",
    lat:
      columns.find((c) => /^(lat(itude)?|y|northing|cell_lat|site_lat|target_lat|source_lat|wgs84_lat|lat_dd|ycoord|y_coord)$/i.test(c.trim())) ??
      columns.find((c) => /lat|northing/i.test(c.trim())) ??
      columns.find((c) => /^y$/i.test(c.trim())) ??
      "",
    lng:
      columns.find((c) => /^(lon(gitude)?|lng|long|x|easting|cell_lon|cell_lng|site_lon|site_lng|target_lon|target_lng|source_lon|source_lng|wgs84_lon|lon_dd|xcoord|x_coord)$/i.test(c.trim())) ??
      columns.find((c) => /lon|lng|long|easting/i.test(c.trim())) ??
      columns.find((c) => /^x$/i.test(c.trim())) ??
      "",
  };
}


/* ------------------------------------------------------------- primitives */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function ColorSwatches({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mapping-field">
      <div className="mapping-label">
        <label>{label}</label>
        <span>{value.toUpperCase()}</span>
      </div>
      <div className="sw-row">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`sw ${value === c ? "active" : ""}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <label className="sw sw-custom" title="Custom colour">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <span style={{ background: value }} />
        </label>
      </div>
    </div>
  );
}

function FilePanel({
  data,
  loading,
  onFile,
  onSheet,
  tableOnly = false,
  busy = false,
}: {
  data: Dataset | null;
  loading: boolean;
  onFile: (file: File) => void;
  onSheet: (name: string) => void;
  tableOnly?: boolean;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`dropzone ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !busy) onFile(file);
      }}
    >
      <button
        type="button"
        className="dropzone-picker"
        disabled={busy}
        title={data ? "Click or drop a file to replace" : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {data ? <I.Sheet /> : <I.Cloud />}
        <strong>{loading ? "Parsing file…" : data?.fileName ?? "Drop file to upload"}</strong>
        {data ? (
          <span>
            {data.sheetName ? `${data.sheetName} · ` : ""}
            {data.rows.length.toLocaleString()} rows · {data.columns.length} columns
          </span>
        ) : (
          <span>{tableOnly ? "CSV · XLSX · XLS" : "CSV · XLSX · XLS · TXT · KML · GPX"}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={tableOnly ? ".csv,.xlsx,.xls" : ".csv,.txt,.xlsx,.xls,.kml,.gpx"}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      {data?.sheetNames && data.sheetNames.length > 1 && (
        <select
          className="field-control dropzone-sheet"
          aria-label={tableOnly ? "Neighbour Links worksheet" : "All Sites worksheet"}
          value={data.sheetName ?? ""}
          disabled={busy}
          onChange={(event) => onSheet(event.target.value)}
        >
          {data.sheetNames.map((sheet) => <option key={sheet}>{sheet}</option>)}
        </select>
      )}
    </div>
  );
}

function MappingFields({
  mapping,
  columns,
  onChange,
}: {
  mapping: SiteMapping;
  columns: string[];
  onChange: (mapping: SiteMapping) => void;
}) {
  return (
    <>
      {!columns.length && <p className="field-help">Upload a dataset first to map its columns.</p>}

      {MAP_FIELDS.map((f) => (
        <div className="mapping-field" key={f.key}>
          <div className="mapping-label">
            <label htmlFor={`map-column-${f.key}`}>
              {f.label} <b>*</b>
            </label>
            <span>{f.hint}</span>
          </div>
          <select
            id={`map-column-${f.key}`}
            className="field-control"
            value={mapping[f.key]}
            onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value })}
            disabled={!columns.length}
          >
            <option value="">— Select column —</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ))}

    </>
  );
}

function PopupFields({
  label,
  columns,
  selected,
  onChange,
}: {
  label: string;
  columns: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const toggle = (col: string) => {
    const next = new Set(selected);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    onChange(next);
  };

  return (
    <>
      <div className="mapping-label">
        <label>{label}</label>
        <span>{selected.size} selected</span>
      </div>
      <div className="source-actions">
        <button onClick={() => onChange(new Set(columns))}>Select all</button>
        <button onClick={() => onChange(new Set<string>())}>Clear</button>
      </div>
      <div className="check-list" style={{ marginTop: 12 }}>
        {columns.map((col) => (
          <label className="check-row" key={col}>
            <input type="checkbox" checked={selected.has(col)} onChange={() => toggle(col)} />
            <span>
              <strong>{col}</strong>
            </span>
          </label>
        ))}
        {!columns.length && <div className="pg-empty" style={{ fontSize: 10 }}>No columns yet.</div>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- app */
export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 860);
  const [tab, setTab] = useState<Tab>("upload");
  const [boxZoom, setBoxZoom] = useState(false);

  const [sourceData, setSourceData] = useState<Dataset | null>(null);
  const [sourceMapping, setSourceMapping] = useState<SiteMapping>(EMPTY_MAPPING);
  const [linkData, setLinkData] = useState<Dataset | null>(null);
  const [linkMapping, setLinkMapping] = useState<LinkMapping>({ source: "", neighbor: "" });
  const [popupColumns, setPopupColumns] = useState<Set<string>>(new Set());
  const sourceFileRef = useRef<File | null>(null);
  const linkFileRef = useRef<File | null>(null);
  const pendingFile = useRef(false);
  const [loading, setLoading] = useState<FileKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [markerSize, setMarkerSize] = useState(1);
  const [lineThickness, setLineThickness] = useState(2);
  const [lineColor, setLineColor] = useState("#10b981");
  const [lineOpacity, setLineOpacity] = useState(40);
  const [sourceIconColor, setSourceIconColor] = useState("#13a38f");
  const [neighborIconColor, setNeighborIconColor] = useState("#ef4444");
  const [otherSiteColor, setOtherSiteColor] = useState("#2563eb");
  const [showSiteLabels, setShowSiteLabels] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [filterCol, setFilterCol] = useState("");
  const [filterVals, setFilterVals] = useState<string[]>([]);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [focusSite, setFocusSite] = useState<{ id: string; timestamp: number } | null>(null);

  const sourceColumns = sourceData?.columns ?? [];
  const linkColumns = linkData?.columns ?? [];
  const canPlotLinks = !!sourceData && !!linkData
    && distinctColumns(sourceData, Object.values(sourceMapping))
    && distinctColumns(linkData, Object.values(linkMapping));

  const [processedData, setProcessedData] = useState<CalculatedData | null>(null);
  const calculatedData = processedData ?? EMPTY_RESULTS;

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const resetSelection = () => {
    setSelectedSite(null);
    setFocusSite(null);
    setSearchTerm("");
    setShowDropdown(false);
  };

  const resetFilters = () => {
    setFilterCol("");
    setFilterVals([]);
  };

  const invalidateResults = () => {
    setProcessedData(null);
    resetSelection();
  };

  const processLinks = () => {
    if (!canPlotLinks || !sourceData || !linkData || pendingFile.current) return;
    resetSelection();
    setProcessedData(importSiteLinks(sourceData, sourceMapping, linkData, linkMapping).data);
    if (window.innerWidth <= 860) setSidebarOpen(false);
  };

  const loadFile = async (file: File, kind: FileKind, sheet?: string) => {
    if (pendingFile.current) return;
    pendingFile.current = true;
    setLoading(kind);
    setError(null);
    try {
      if (kind === "neighbors" && !/\.(csv|xlsx|xls)$/i.test(file.name)) {
        throw new Error("Choose a CSV or Excel file for the Neighbour Links file.");
      }
      const dataset = sheet ? await parseFileSheet(file, sheet) : await parseFile(file);
      if (kind === "source") {
        if (!dataset.rows.length) throw new Error("The All Sites file contains no data rows.");
        sourceFileRef.current = file;
        setSourceData(dataset);
        setSourceMapping(guessMapping(dataset.columns));
        setPopupColumns(new Set(dataset.columns));
        resetFilters();
      } else {
        linkFileRef.current = file;
        setLinkData(dataset);
        setLinkMapping(guessLinkMapping(dataset.columns));
      }
      invalidateResults();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setLoading(null);
      pendingFile.current = false;
    }
  };

  const removeSource = () => {
    sourceFileRef.current = null;
    setSourceData(null);
    setSourceMapping(EMPTY_MAPPING);
    setPopupColumns(new Set());
    setError(null);
    resetFilters();
    invalidateResults();
  };

  const removeLinks = () => {
    linkFileRef.current = null;
    setLinkData(null);
    setLinkMapping({ source: "", neighbor: "" });
    setError(null);
    invalidateResults();
  };

  const clearSession = () => {
    removeSource();
    removeLinks();
    setTab("upload");
    flash("Session cleared");
  };

  const { sitesWithNeighbors, allSites, connections, filteredSourceIds } = useMemo(() => {
    if (!filterCol || filterVals.length === 0) {
      return { ...calculatedData, filteredSourceIds: null };
    }

    let {
      sitesWithNeighbors: rawSites,
      allSites: rawAll,
      connections: rawConns,
    } = calculatedData;

    // A Set rather than Array.includes: this runs once per site, and a linear
    // scan over the picked values is the whole cost of the filter.
    const wanted = new Set(filterVals);
    rawSites = rawSites.filter((s) =>
      wanted.has(String(s.originalData?.[filterCol] ?? "").trim() || "(blank)"),
    );
    const keptSources = new Set(rawSites.map((s) => s.id));
    const keptIds = new Set(keptSources);
    rawConns
      .filter((c) => keptSources.has(c.from))
      .forEach((c) => keptIds.add(c.to));
    rawAll = rawAll.filter((s) => keptIds.has(s.id));
    rawConns = rawConns.filter((c) => keptSources.has(c.from));

    return { sitesWithNeighbors: rawSites, allSites: rawAll, connections: rawConns, filteredSourceIds: keptSources };
  }, [calculatedData, filterCol, filterVals]);

  const uniqueFilterVals = useMemo(
    () =>
      filterCol && sourceData
        ? Array.from(
            new Set(sourceData.rows.map((r) => String(r[filterCol] ?? "").trim() || "(blank)")),
          )
        : [],
    [filterCol, sourceData],
  );

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchSites = allSites;

  // Fast map from lowercase Site ID -> Site for O(1) exact matching
  const searchSiteMap = useMemo(() => {
    const map = new Map<string, Site>();
    for (let i = 0; i < searchSites.length; i++) {
      map.set(searchSites[i].id.toLowerCase(), searchSites[i]);
    }
    return map;
  }, [searchSites]);

  const exactSiteMap = useMemo(() => new Map(searchSites.map((site) => [site.id, site])), [searchSites]);

  const searchMatchingSites = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    const hits: Site[] = [];
    const MAX_HITS = 40;
    for (let i = 0; i < searchSites.length; i++) {
      const s = searchSites[i];
      if (s.id.toLowerCase().includes(q)) {
        hits.push(s);
        if (hits.length >= MAX_HITS) return hits;
      }
    }
    for (let i = 0; i < searchSites.length; i++) {
      const s = searchSites[i];
      if (s.id.toLowerCase().includes(q)) continue;
      if (s.originalData) {
        let match = false;
        const vals = Object.values(s.originalData);
        for (let j = 0; j < vals.length; j++) {
          const v = vals[j];
          if (v !== null && v !== undefined && String(v).toLowerCase().includes(q)) {
            match = true;
            break;
          }
        }
        if (match) {
          hits.push(s);
          if (hits.length >= MAX_HITS) return hits;
        }
      }
    }
    return hits;
  }, [searchSites, searchTerm]);

  useEffect(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      setSelectedSite(null);
      setFocusSite(null);
      return;
    }
    const exact = exactSiteMap.get(searchTerm.trim()) ?? searchSiteMap.get(q);
    if (exact) {
      setSelectedSite(exact.id);
      setFocusSite({ id: exact.id, timestamp: Date.now() });
    } else if (searchMatchingSites.length === 1) {
      setSelectedSite(searchMatchingSites[0].id);
      setFocusSite({ id: searchMatchingSites[0].id, timestamp: Date.now() });
    }
  }, [exactSiteMap, searchSiteMap, searchMatchingSites, searchTerm]);

  const handleSiteClick = useCallback((id: string | null) => {
    setSelectedSite(id);
    if (id === null) {
      setSearchTerm("");
      setFocusSite(null);
    } else {
      setSearchTerm(id);
      setFocusSite({ id, timestamp: Date.now() });
    }
    setShowDropdown(false);
  }, []);


  const legendItems = [
    { label: filteredSourceIds ? "Filtered source" : "Selected source", color: sourceIconColor },
    { label: "Listed neighbour", color: neighborIconColor },
    ...(filteredSourceIds ? [] : [{ label: "Other site", color: otherSiteColor }]),
  ];

  const handleExportKmz = async () => {
    await exportKmzFile({
      filename: "neighbour-links.kmz",
      sourceIcon: { url: "VECTOR_CIRCLE", color: sourceIconColor, scale: markerSize, opacity: 1 },
      neighborIcon: { url: "VECTOR_CIRCLE", color: neighborIconColor, scale: markerSize, opacity: 1 },
      allSites,
      sitesWithNeighbors,
      connections,
      lineColor,
      lineThickness,
      lineOpacity,
      showVoronoi: false,
      distanceUnit: "km",
      calcMethod: "brute",
      voronoiLayers: 1,
      nNeighbors: 0,
      popupColumns,
      popupColumnsTarget: EMPTY_POPUP_COLUMNS,
      hasTarget: false,
      listedLinks: true,
      filteredSourceIds,
    });
    flash("KMZ exported");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBoxZoom(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------------------------------------------------------- view */
  return (
    <div className="app-shell">
      {/* ============================ header ============================ */}
      <header className="app-header">
        <div className="brand">
          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle input panel"
            aria-label="Toggle input panel"
          >
            <I.Menu />
          </button>
          <div className="brand-name">Source and Neighbour Check</div>
        </div>
      </header>

      <div className="workspace">
        {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close" />}

        {/* ============================ sidebar =========================== */}
        <aside className={`sidebar ${sidebarOpen ? "is-open" : "collapsed"}`}>
          <div className="sidebar-mobile-head">
            CONFIGURATION
            <button onClick={() => setSidebarOpen(false)} aria-label="Close panel">
              <I.X size={16} />
            </button>
          </div>

          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                <t.Icon />
                {t.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-scroll">
            {tab === "upload" && (
              <div className="panel-enter">
                <section className="sidebar-section intro-section">
                  <div className="section-kicker">Step 01</div>
                  <h1>Load your sites and neighbours.</h1>
                  <p>Load the site coordinates and the file that lists each site's outgoing neighbours.</p>
                </section>

                <section className="sidebar-section border-top upload-section">
                  <div className="mapping-label">
                    <label>All Sites file</label>
                    <span>{sourceData ? "loaded" : "required"}</span>
                  </div>
                  <FilePanel
                    data={sourceData}
                    loading={loading === "source"}
                    busy={!!loading}
                    onFile={(file) => void loadFile(file, "source")}
                    onSheet={(sheet) => {
                      if (sourceFileRef.current) void loadFile(sourceFileRef.current, "source", sheet);
                    }}
                  />
                </section>

                <section className="sidebar-section border-top upload-section">
                  <div className="mapping-label">
                    <label>Neighbour Links file</label>
                    <span>{linkData ? "loaded" : "required"}</span>
                  </div>
                  <FilePanel
                    data={linkData}
                    loading={loading === "neighbors"}
                    busy={!!loading}
                    tableOnly
                    onFile={(file) => void loadFile(file, "neighbors")}
                    onSheet={(sheet) => {
                      if (linkFileRef.current) void loadFile(linkFileRef.current, "neighbors", sheet);
                    }}
                  />
                  {error && <div className="error-note" role="alert">{error}</div>}
                </section>
              </div>
            )}

            {tab === "columns" && (
              <div className="panel-enter">
                <section className="sidebar-section intro-section compact">
                  <div className="section-kicker">Step 02</div>
                  <h1>Map your data columns.</h1>
                  <p>Map the required columns, then select Process in Export.</p>
                </section>

                <section className="sidebar-section border-top">
                  <span className="unit-label calc-method-label">All Sites columns</span>
                  <MappingFields
                    mapping={sourceMapping}
                    columns={sourceColumns}
                    onChange={(mapping) => {
                      setSourceMapping(mapping);
                      invalidateResults();
                    }}
                  />
                </section>

                <section className="sidebar-section border-top">
                  <span className="unit-label calc-method-label">Neighbour Links columns</span>
                  <p className="field-help">Each row links a source site to one neighbour. Site IDs must match the All Sites file.</p>
                  {(["source", "neighbor"] as const).map((field) => (
                    <div className="mapping-field" key={field}>
                      <div className="mapping-label">
                        <label htmlFor={"link-column-" + field}>{field === "source" ? "Source site" : "Neighbour site"} <b>*</b></label>
                      </div>
                      <select
                        id={"link-column-" + field}
                        className="field-control"
                        value={linkMapping[field]}
                        disabled={!linkColumns.length}
                        onChange={(e) => {
                          setLinkMapping({ ...linkMapping, [field]: e.target.value });
                          invalidateResults();
                        }}
                      >
                        <option value="">— Select column —</option>
                        {linkColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                    </div>
                  ))}
                  {sourceData && linkData && !canPlotLinks && (
                    <p className="field-help">Choose a distinct column for each required field in its file.</p>
                  )}
                  {processedData && !processedData.allSites.length && (
                    <div className="error-note" role="alert">The All Sites file has no rows with both a valid ID and valid coordinates.</div>
                  )}
                </section>

                <section className="sidebar-section border-top">
                  <span className="unit-label calc-method-label">Popup Fields</span>
                  <PopupFields
                    label="Site popup fields"
                    columns={sourceColumns}
                    selected={popupColumns}
                    onChange={setPopupColumns}
                  />
                </section>
              </div>
            )}

            {tab === "style" && (
              <div className="panel-enter">
                <section className="sidebar-section intro-section compact">
                  <div className="section-kicker">Step 03</div>
                  <h1>Customize map appearance.</h1>
                  <p>Configure marker colours, connection lines, and labels.</p>
                </section>

                <section className="sidebar-section border-top">
                  <span className="unit-label calc-method-label">Marker Styling</span>
                  <div className="analysis-box">
                    <div className="analysis-panel">
                      <ColorSwatches label="Source sites" value={sourceIconColor} onChange={setSourceIconColor} />

                      <ColorSwatches
                        label="Listed neighbours"
                        value={neighborIconColor}
                        onChange={setNeighborIconColor}
                      />
                      <ColorSwatches label="Other sites" value={otherSiteColor} onChange={setOtherSiteColor} />

                      <div className="range-setting" style={{ marginTop: 8 }}>
                        <div>
                          Marker scale <span>{markerSize.toFixed(1)}×</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={markerSize}
                          onChange={(e) => setMarkerSize(parseFloat(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="sidebar-section border-top">
                  <span className="unit-label calc-method-label">Connection Lines</span>
                  <div className="analysis-box">
                    <div className="analysis-panel">
                      <ColorSwatches label="Line colour" value={lineColor} onChange={setLineColor} />

                      <div className="range-setting" style={{ marginTop: 8 }}>
                        <div>
                          Line thickness <span>{lineThickness}px</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={lineThickness}
                          onChange={(e) => setLineThickness(parseInt(e.target.value))}
                        />
                      </div>

                      <div className="range-setting" style={{ marginTop: 12 }}>
                        <div>
                          Line opacity <span>{lineOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={lineOpacity}
                          onChange={(e) => setLineOpacity(parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="sidebar-section border-top">
                  <span className="unit-label calc-method-label">Display Options</span>
                  <div className="analysis-box">
                    <div className="analysis-panel">
                      <Toggle
                        label="Site labels"
                        hint="Always show names beside points"
                        checked={showSiteLabels}
                        onChange={setShowSiteLabels}
                      />
                      <Toggle
                        label="Map legend"
                        hint="Colour key at the bottom of the map"
                        checked={showLegend}
                        onChange={setShowLegend}
                      />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {tab === "filter" && (
              <div className="panel-enter">
                <section className="sidebar-section intro-section compact">
                  <div className="section-kicker">Step 04</div>
                  <h1>Export neighbour links.</h1>
                  <p>Process the files to show sites on the map, then export the links.</p>
                </section>
                <section className="sidebar-section border-top">
                  <div className="export-stack">
                    <button className="connect-button" disabled={!canPlotLinks || !!loading} onClick={processLinks}>
                      Process
                    </button>
                    <button className="action-button action-blue" disabled={!allSites.length || !!loading} onClick={handleExportKmz}>
                      <I.Export /> Export KMZ
                    </button>
                    <button className="action-button action-red-outline" disabled={!!loading} onClick={clearSession}>
                      <I.Trash /> Clear session
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </aside>

        {/* ========================== map workspace ======================== */}
        <main className="map-workspace">
          <div className="map-toolbar">
            <div className="map-search" ref={searchContainerRef} style={{ position: "relative" }}>
              <I.Search />
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (searchMatchingSites.length > 0) {
                      const q = searchTerm.trim().toLowerCase();
                      const exact = exactSiteMap.get(searchTerm.trim()) ?? searchSiteMap.get(q);
                      const pick = exact ?? searchMatchingSites[0];
                      setSelectedSite(pick.id);
                      setSearchTerm(pick.id);
                      setFocusSite({ id: pick.id, timestamp: Date.now() });
                      setShowDropdown(false);
                    }
                  } else if (e.key === "Escape") {
                    setShowDropdown(false);
                  }
                }}
                placeholder="Search site name or attributes…"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedSite(null);
                    setFocusSite(null);
                    setShowDropdown(false);
                  }}
                  aria-label="Clear search"
                >
                  <I.X size={13} />
                </button>
              )}

              {showDropdown && searchTerm.trim() && searchMatchingSites.length > 0 && (
                <div
                  className="search-dropdown"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: "#ffffff",
                    borderRadius: 8,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                    border: "1px solid #e2e8f0",
                    maxHeight: 280,
                    overflowY: "auto",
                    zIndex: 100,
                  }}
                >
                  {searchMatchingSites.slice(0, 20).map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedSite(s.id);
                        setSearchTerm(s.id);
                        setFocusSite({ id: s.id, timestamp: Date.now() });
                        setShowDropdown(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        borderBottom: "1px solid #f1f5f9",
                        backgroundColor: selectedSite === s.id ? "#f0fdf4" : "transparent",
                        fontWeight: selectedSite === s.id ? 700 : 500,
                        color: selectedSite === s.id ? "#15803d" : "#1e293b",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          selectedSite === s.id ? "#f0fdf4" : "transparent")
                      }
                    >
                      <div>
                        <div>{s.id}</div>
                      </div>
                      <small style={{ color: "#94a3b8" }}>
                        {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                      </small>
                    </div>
                  ))}
                  {searchMatchingSites.length > 20 && (
                    <div
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        color: "#64748b",
                        backgroundColor: "#f8fafc",
                        textAlign: "center",
                      }}
                    >
                      Showing 20 of {searchMatchingSites.length.toLocaleString()} matches
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="toolbar-divider" />

            <div className="status-filter">
              <select
                value={filterCol}
                onChange={(e) => {
                  setFilterCol(e.target.value);
                  setFilterVals([]);
                  resetSelection();
                }}
              >
                <option value="">All columns</option>
                {sourceColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {filterCol && (
                <select
                  value={filterVals.length === 1 ? filterVals[0] : ""}
                  onChange={(e) => {
                    setFilterVals(e.target.value ? [e.target.value] : []);
                    resetSelection();
                  }}
                >
                  <option value="">Any value</option>
                  {uniqueFilterVals.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </div>


            <div className="toolbar-count" role="status">
              {!processedData ? (canPlotLinks ? "Ready to process" : "Files and mappings required")
                : !processedData.allSites.length ? "No sites with valid coordinates"
                : filteredSourceIds ? (
                  <>
                    Sources <strong>{filteredSourceIds.size.toLocaleString()}</strong> ·{" "}
                    Neighbours {(allSites.length - filteredSourceIds.size).toLocaleString()} ·{" "}
                    Links {connections.length.toLocaleString()}
                  </>
                ) : searchTerm.trim() ? (
                <>
                  <strong>{searchMatchingSites.length.toLocaleString()}</strong> matched (
                  {searchSites.length.toLocaleString()} total)
                </>
              ) : (
                <>
                  <strong>{allSites.length.toLocaleString()}</strong> /{" "}
                  {(sourceData?.rows.length ?? 0).toLocaleString()} points
                </>
              )}
            </div>
            <button
              type="button"
              className="box-zoom-button"
              aria-pressed={boxZoom}
              title="Drag a rectangle on the map to zoom. Press Escape to cancel."
              onClick={() => setBoxZoom((active) => !active)}
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="lucide lucide-square-dashed-search"
                aria-hidden="true"
              >
                <path d="M14 3h1" />
                <path d="M19 3a2 2 0 0 1 2 2" />
                <path d="m21 21-1.875-1.875" />
                <path d="M21 9v1" />
                <path d="M3 14v1" />
                <path d="M3 9v1" />
                <path d="M5 21a2 2 0 0 1-2-2" />
                <path d="M5 3a2 2 0 0 0-2 2" />
                <path d="M9 21h1" />
                <path d="M9 3h1" />
                <circle cx="17" cy="17" r="3" />
              </svg>
              Box Zoom
            </button>
          </div>

          <div className="map-frame">
            <MapView
              sites={allSites}
              connections={filteredSourceIds ? connections : NO_CONNECTIONS}
              selectedSite={selectedSite}
              onSiteClick={handleSiteClick}
              focusSite={focusSite}
              lineThickness={lineThickness}
              lineColor={lineColor}
              lineOpacity={lineOpacity}
              markerIconUrl="VECTOR_CIRCLE"
              iconColor={sourceIconColor}
              iconOpacity={100}
              iconScale={markerSize}
              neighborMarkerIconUrl="VECTOR_CIRCLE"
              neighborIconColor={neighborIconColor}
              otherSiteColor={otherSiteColor}
              neighborIconOpacity={100}
              neighborIconScale={markerSize}
              showSiteLabels={showSiteLabels}
              markerSize={markerSize}
              singleIconMode
              sitesWithNeighbors={sitesWithNeighbors}
              nNeighbors={0}
              distanceUnit="km"
              popupColumns={popupColumns}
              popupColumnsTarget={EMPTY_POPUP_COLUMNS}
              showVoronoi={false}
              calcMethod="brute"
              voronoiLayers={1}
              listedNeighbors
              boxZoom={boxZoom}
              onBoxZoomEnd={() => setBoxZoom(false)}
              filteredSourceIds={filteredSourceIds}
              sidebarOpen={sidebarOpen}
            />

            {showLegend && allSites.length > 0 && (
              <div className="map-footer-info align-start">
                <div className="legend-inline">
                  <div className="legend-title">Neighbour links</div>
                  <div className="legend-list">
                    {legendItems.map((it) => (
                      <span key={it.label}>
                        <i style={{ background: it.color }} />
                        {it.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
