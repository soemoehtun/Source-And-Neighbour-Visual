import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  featureCollection,
  polygon as turfPolygon,
} from "@turf/helpers";
import type {
  CalcMethod,
  Connection,
  DistanceUnit,
  MapLayer,
  NeighborResult,
  Site,
  SiteWithNeighbors,
} from "@/types";
import { BASEMAPS, DEFAULT_MAP_LAYER, LAYER_COLORS, OTHER_SITE_COLOR } from "@/types";
import { engineCellsFor, engineVoronoiCells } from "@/lib/engine";
import type { BeamFeature } from "@/lib/beam";
import {
  buildVoronoiIndex,
  computeAllVoronoiPolygons,
  computeDelaunay,
  computeVoronoiCellPolygon,
} from "@/lib/voronoi";


interface Props {
  sites: Site[];
  connections: Connection[];
  selectedSite: string | null;
  onSiteClick: (id: string | null) => void;
  focusSite?: { id: string; timestamp: number } | null;
  mapStyle?: MapLayer;
  lineThickness: number;
  lineColor: string;
  lineOpacity: number;
  markerIconUrl: string;
  iconColor: string;
  iconOpacity: number;
  iconScale: number;
  neighborMarkerIconUrl: string;
  neighborIconColor: string;
  otherSiteColor?: string;
  neighborIconOpacity: number;
  neighborIconScale: number;
  showSiteLabels: boolean;
  markerSize: number;
  singleIconMode: boolean;
  sitesWithNeighbors: SiteWithNeighbors[];
  nNeighbors: number;
  distanceUnit: DistanceUnit;
  popupColumns: Set<string>;
  popupColumnsTarget: Set<string>;
  showVoronoi: boolean;
  calcMethod: CalcMethod;
  voronoiLayers: number;
  beams?: BeamFeature[];
  beamWidth?: number;
  faceMode?: boolean;
  listedNeighbors?: boolean;
  boxZoom?: boolean;
  onBoxZoomEnd?: () => void;
  filteredSourceIds?: ReadonlySet<string> | null;
  sidebarOpen?: boolean;
}

const BASEMAP_BY_ID = Object.fromEntries(
  BASEMAPS.map((b) => [b.id, b]),
) as Record<MapLayer, (typeof BASEMAPS)[number]>;

const SRC_SITES = "pfc-sites";
const LAYER_SITES = "pfc-sites-layer";
const LAYER_SITES_SELECTED = "pfc-sites-selected-layer";
const LAYER_SITES_NEIGHBORS = "pfc-sites-neighbors-layer";
const LAYER_LABELS = "pfc-labels-layer";
const LAYER_SITES_SELECTED_LABEL = "pfc-sites-selected-label";

const SRC_CONNECTIONS = "pfc-connections";
const LAYER_CONNECTIONS = "pfc-connections-layer";
const SRC_CONN_LABELS = "pfc-conn-labels";
const LAYER_CONN_LABELS = "pfc-conn-labels-layer";

/** Muted gray for non-facing pairs so face-to-face lines stand out. */
const NOT_FACE_COLOR = "#7c8a96";


const SRC_VORONOI_CELLS = "pfc-voronoi-cells";
const LAYER_VORONOI_CELLS_FILL = "pfc-voronoi-cells-fill";
const LAYER_VORONOI_CELLS_OUTLINE = "pfc-voronoi-cells-outline";

const SRC_BEAMS = "pfc-beams";
const LAYER_BEAMS_FILL = "pfc-beams-fill";
const LAYER_BEAMS_OUTLINE = "pfc-beams-outline";


const BASEMAP_SRC = "pfc-basemap";
const BASEMAP_LAYER = "pfc-basemap-layer";



export default function MapView({
  sites,
  connections,
  selectedSite,
  onSiteClick,
  focusSite,
  mapStyle = DEFAULT_MAP_LAYER,
  lineThickness,
  lineColor,
  lineOpacity,
  iconColor,
  neighborIconColor,
  otherSiteColor = OTHER_SITE_COLOR,
  showSiteLabels,
  markerSize,
  singleIconMode,
  sitesWithNeighbors,
  nNeighbors: _nNeighbors,
  distanceUnit,
  popupColumns,
  popupColumnsTarget,
  showVoronoi,
  calcMethod,
  voronoiLayers,
  beams,
  beamWidth = 65,
  faceMode = false,
  listedNeighbors = false,
  boxZoom = false,
  onBoxZoomEnd,
  filteredSourceIds = null,
  sidebarOpen,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const fitSigRef = useRef<Site[] | null>(null);
  const prevSelectedSiteRef = useRef<string | null>(null);
  const lastFocusTimestampRef = useRef<number>(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const setDrawerOpenRef = useRef(setDrawerOpen);
  setDrawerOpenRef.current = setDrawerOpen;

  useEffect(() => {
    if (!selectedSite) {
      setDrawerOpen(false);
    } else {
      setDrawerOpen(true);
    }
  }, [selectedSite]);

  const sitesById = useMemo(() => {
    const map = new Map<string, Site>();
    for (let i = 0; i < sites.length; i++) map.set(sites[i].id, sites[i]);
    return map;
  }, [sites]);

  const sitesWithNeighborsById = useMemo(() => {
    const map = new Map<string, SiteWithNeighbors>();
    for (let i = 0; i < sitesWithNeighbors.length; i++) {
      map.set(sitesWithNeighbors[i].id, sitesWithNeighbors[i]);
    }
    return map;
  }, [sitesWithNeighbors]);

  const lastFittedSiteRef = useRef<{ id: string; time: number } | null>(null);

  const fitSiteAndNeighbors = useCallback(
    (siteId: string) => {
      const map = mapRef.current;
      if (!map) return;
      const site = sitesById.get(siteId);
      if (!site) return;

      const now = Date.now();
      if (
        lastFittedSiteRef.current &&
        lastFittedSiteRef.current.id === siteId &&
        now - lastFittedSiteRef.current.time < 350
      ) {
        return;
      }
      lastFittedSiteRef.current = { id: siteId, time: now };

      const siteData = sitesWithNeighborsById.get(siteId);
      const neighbors = siteData?.neighbors || [];

      let minLon = site.lng;
      let maxLon = site.lng;
      let minLat = site.lat;
      let maxLat = site.lat;
      let validNeighborsCount = 0;

      for (let i = 0; i < neighbors.length; i++) {
        const nSite = sitesById.get(neighbors[i].to);
        if (!nSite || !isFinite(nSite.lng) || !isFinite(nSite.lat)) continue;
        validNeighborsCount++;
        if (nSite.lng < minLon) minLon = nSite.lng;
        if (nSite.lng > maxLon) maxLon = nSite.lng;
        if (nSite.lat < minLat) minLat = nSite.lat;
        if (nSite.lat > maxLat) maxLat = nSite.lat;
      }

      const { clientWidth, clientHeight } = map.getContainer();
      // Keep the source and neighbors clear of the details drawer opened on selection.
      const narrow = window.innerWidth <= 860;
      const drawerWidth = listedNeighbors && !narrow ? Math.min(350, clientWidth * 0.42) : 0;
      const drawerHeight = listedNeighbors && narrow ? clientHeight * 0.42 : 0;

      if (validNeighborsCount === 0 || (minLon === maxLon && minLat === maxLat)) {
        map.flyTo({
          center: [site.lng, site.lat],
          zoom: Math.max(map.getZoom(), 15),
          offset: [-drawerWidth / 2, -drawerHeight / 2],
          essential: true,
          duration: 750,
        });
      } else {
        map.fitBounds(
          [
            [minLon, minLat],
            [maxLon, maxLat],
          ],
          {
            padding: listedNeighbors
              ? { top: 44, right: drawerWidth + 42, bottom: drawerHeight + 44, left: 42 }
              : 80,
            maxZoom: 16,
            duration: 750,
          },
        );
      }
    },
    [sitesById, sitesWithNeighborsById, listedNeighbors],
  );

  useEffect(() => {
    if (filteredSourceIds || !focusSite || focusSite.timestamp === lastFocusTimestampRef.current) return;
    lastFocusTimestampRef.current = focusSite.timestamp;
    fitSiteAndNeighbors(focusSite.id);
  }, [focusSite, fitSiteAndNeighbors, filteredSourceIds]);

  const selectedSiteObj = useMemo(
    () => (selectedSite ? sitesById.get(selectedSite) ?? null : null),
    [sitesById, selectedSite],
  );
  const selectedSiteData = useMemo(
    () =>
      selectedSite
        ? sitesWithNeighborsById.get(selectedSite) ?? null
        : null,
    [sitesWithNeighborsById, selectedSite],
  );
  const selectedNeighbors: NeighborResult[] = selectedSiteData?.neighbors || [];
  const mapConnections = useMemo<Connection[]>(() => {
    if (!listedNeighbors || filteredSourceIds) return connections;
    if (!selectedSiteData) return [];
    return selectedSiteData.neighbors.map(({ to, dist }) => ({
      from: selectedSiteData.id, to, distance: dist,
    }));
  }, [connections, listedNeighbors, filteredSourceIds, selectedSiteData]);
  const drawerCols = useMemo(() => {
    if (!selectedSiteObj) return [];
    const colsSet =
      !singleIconMode && selectedSiteObj.isTarget && !selectedSiteObj.isSource
        ? popupColumnsTarget
        : popupColumns;
    return Array.from(colsSet);
  }, [selectedSiteObj, singleIconMode, popupColumns, popupColumnsTarget]);

  const layerNumbers = useMemo(() => {
    const set = new Set<number>();
    selectedNeighbors.forEach((n: NeighborResult) => set.add(n.layer || 1));
    return Array.from(set).sort((a, b) => a - b);
  }, [selectedNeighbors]);

  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const onSiteClickRef = useRef(onSiteClick);
  onSiteClickRef.current = onSiteClick;
  const selectedSiteRef = useRef(selectedSite);
  selectedSiteRef.current = selectedSite;

  const radius = Math.max(3, 6 * markerSize);

  const applySitesData = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(SRC_SITES) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features = new Array(sites.length);
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      features[i] = {
        type: "Feature" as const,
        id: s.id,
        geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
        properties: {
          id: s.id,
          labelPriority: filteredSourceIds?.has(s.id) ? 0 : 1,
          color: filteredSourceIds
            ? (filteredSourceIds.has(s.id) ? iconColor : neighborIconColor)
            : listedNeighbors
            ? otherSiteColor
            : !singleIconMode && s.isTarget && !s.isSource
              ? neighborIconColor
              : iconColor,
        },
      };
    }

    src.setData({ type: "FeatureCollection", features });
  }, [sites, iconColor, neighborIconColor, otherSiteColor, singleIconMode, listedNeighbors, filteredSourceIds]);

  const applySitesPaintAndCamera = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer(LAYER_SITES)) {
      try {
        map.setPaintProperty(LAYER_SITES, "circle-radius", radius);
        map.setPaintProperty(LAYER_SITES_SELECTED, "circle-radius", radius * 2.0);
        map.setPaintProperty(LAYER_SITES_NEIGHBORS, "circle-radius", radius * 1.5);
      } catch {
        // safe ignore
      }
    }

    if (!sites.length) {
      fitSigRef.current = null;
      return;
    }

    if (fitSigRef.current === sites) return;
    fitSigRef.current = sites;

    if (sites.length === 1) {
      const s = sites[0];
      map.flyTo({
        center: [s.lng, s.lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 500,
      });
      return;
    }

    let minLon = Infinity,
      minLat = Infinity,
      maxLon = -Infinity,
      maxLat = -Infinity;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (s.lng < minLon) minLon = s.lng;
      if (s.lat < minLat) minLat = s.lat;
      if (s.lng > maxLon) maxLon = s.lng;
      if (s.lat > maxLat) maxLat = s.lat;
    }
    if (!isFinite(minLon) || !isFinite(minLat)) return;

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 60, maxZoom: 15, duration: 500 },
    );
  }, [sites, radius]);

  const applyConnectionsData = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(SRC_CONNECTIONS) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (calcMethod === "voronoi" || !mapConnections.length) {
      src.setData({ type: "FeatureCollection", features: [] });
      const lbSrc = map.getSource(SRC_CONN_LABELS) as maplibregl.GeoJSONSource | undefined;
      if (lbSrc) lbSrc.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const siteMap = sitesById;
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const includeLabels = faceMode && mapConnections.length <= 2000;
    const labels: GeoJSON.Feature<GeoJSON.Point>[] = [];

    for (const c of mapConnections) {
      const p1 = siteMap.get(c.from);
      const p2 = siteMap.get(c.to);
      if (!p1 || !p2) continue;
      const face = Boolean(c.faceToFace);
      features.push({
        type: "Feature",
        properties: { from: c.from, to: c.to, distance: c.distance, face },
        geometry: {
          type: "LineString",
          coordinates: [
            [p1.lng, p1.lat],
            [p2.lng, p2.lat],
          ],
        },
      });

      if (includeLabels && face) {
        let lng1 = p1.lng;
        let lng2 = p2.lng;
        if (Math.abs(lng1 - lng2) > 180) {
          if (lng1 > lng2) lng2 += 360;
          else lng1 += 360;
        }
        const midLng = (((lng1 + lng2) / 2) % 360 + 360) % 360;
        const midLat = (p1.lat + p2.lat) / 2;
        const distText =
          c.distance >= 10 ? c.distance.toFixed(1) : c.distance.toFixed(2);
        labels.push({
          type: "Feature",
          properties: { from: c.from, to: c.to, face, label: `${distText} ${distanceUnit}` },
          geometry: { type: "Point", coordinates: [midLng, midLat] },
        });
      }
    }

    src.setData({ type: "FeatureCollection", features });
    const lbSrc = map.getSource(SRC_CONN_LABELS) as maplibregl.GeoJSONSource | undefined;
    if (lbSrc) lbSrc.setData({ type: "FeatureCollection", features: labels });

    if (!selectedSiteRef.current && map.getLayer(LAYER_CONNECTIONS)) {
      map.setFilter(LAYER_CONNECTIONS, null);
      map.setPaintProperty(LAYER_CONNECTIONS, "line-opacity", lineOpacity / 100);
      map.setPaintProperty(LAYER_CONNECTIONS, "line-width", lineThickness);
    }
  }, [mapConnections, sitesById, calcMethod, distanceUnit, faceMode, lineOpacity, lineThickness]);

  const applyConnectionsPaint = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LAYER_CONNECTIONS)) return;
    try {
      if (faceMode) {
        map.setPaintProperty(LAYER_CONNECTIONS, "line-color", [
          "case",
          ["get", "face"],
          lineColor,
          NOT_FACE_COLOR,
        ]);
        map.setPaintProperty(LAYER_CONNECTIONS, "line-dasharray", [
          "case",
          ["get", "face"],
          ["literal", [1, 0]],
          ["literal", [4, 2]],
        ]);
      } else {
        map.setPaintProperty(LAYER_CONNECTIONS, "line-color", lineColor);
        map.setPaintProperty(LAYER_CONNECTIONS, "line-dasharray", ["literal", [1, 0]]);
      }
      if (!selectedSite) {
        map.setFilter(LAYER_CONNECTIONS, null);
        map.setPaintProperty(LAYER_CONNECTIONS, "line-width", lineThickness);
        map.setPaintProperty(LAYER_CONNECTIONS, "line-opacity", lineOpacity / 100);
      }
      if (map.getLayer(LAYER_CONN_LABELS)) {
        if (!selectedSite) {
          map.setFilter(LAYER_CONN_LABELS, null);
          map.setLayoutProperty(
            LAYER_CONN_LABELS,
            "visibility",
            faceMode ? "visible" : "none",
          );
        }
      }
    } catch {
      // layer fallback
    }
  }, [lineColor, lineThickness, lineOpacity, selectedSite, faceMode]);

  const applyVoronoiData = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const srcCells = map.getSource(SRC_VORONOI_CELLS) as maplibregl.GeoJSONSource | undefined;
    if (!srcCells) return;

    if (!showVoronoi || sites.length < 3) {
      if (!selectedSite) srcCells.setData(featureCollection([]));
      return;
    }

    if (!selectedSite) {
      void engineVoronoiCells(sites).then((features) => {
        if (mapRef.current !== map) return;
        srcCells.setData(
          featureCollection(features ?? computeAllVoronoiPolygons(sites)),
        );
      });
    }
  }, [showVoronoi, sites, selectedSite]);

  const applyBeamData = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(SRC_BEAMS) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: beams as unknown as GeoJSON.Feature<GeoJSON.Polygon>[],
    });
  }, [beams]);

  const applySelection = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LAYER_SITES)) return;

    try {
      map.setPaintProperty(LAYER_SITES_SELECTED, "circle-stroke-color", listedNeighbors ? iconColor : "#10b981");
      map.setPaintProperty(LAYER_SITES_NEIGHBORS, "circle-stroke-color", listedNeighbors ? neighborIconColor : "#f59e0b");
      if (!selectedSite || filteredSourceIds) {
        prevSelectedSiteRef.current = null;
        map.setFilter(LAYER_SITES_SELECTED, ["==", ["get", "id"], ""]);
        map.setFilter(LAYER_SITES_NEIGHBORS, ["==", ["get", "id"], ""]);
        map.setPaintProperty(LAYER_SITES, "circle-color", ["get", "color"]);
        map.setPaintProperty(LAYER_SITES, "circle-opacity", 1);
        map.setPaintProperty(LAYER_SITES, "circle-stroke-opacity", 1);

        if (calcMethod !== "voronoi" && map.getLayer(LAYER_CONNECTIONS)) {
          map.setFilter(LAYER_CONNECTIONS, null);
          map.setPaintProperty(LAYER_CONNECTIONS, "line-opacity", lineOpacity / 100);
          map.setPaintProperty(LAYER_CONNECTIONS, "line-width", lineThickness);
          if (faceMode) {
            map.setPaintProperty(LAYER_CONNECTIONS, "line-color", [
              "case",
              ["get", "face"],
              lineColor,
              NOT_FACE_COLOR,
            ]);
          } else {
            map.setPaintProperty(LAYER_CONNECTIONS, "line-color", lineColor);
          }
        }

        if (map.getLayer(LAYER_CONN_LABELS)) {
          map.setFilter(LAYER_CONN_LABELS, null);
          map.setLayoutProperty(
            LAYER_CONN_LABELS,
            "visibility",
            faceMode ? "visible" : "none",
          );
        }

        if (map.getLayer(LAYER_LABELS)) {
          map.setFilter(LAYER_LABELS, null);
          map.setLayoutProperty(
            LAYER_LABELS,
            "visibility",
            showLabelsRef.current && sites.length > 0 ? "visible" : "none",
          );
        }
        if (map.getLayer(LAYER_SITES_SELECTED_LABEL)) {
          map.setFilter(LAYER_SITES_SELECTED_LABEL, ["==", ["get", "id"], ""]);
        }

        if (map.getLayer(LAYER_BEAMS_FILL)) {
          map.setPaintProperty(LAYER_BEAMS_FILL, "fill-opacity", 0.16);
        }
        if (map.getLayer(LAYER_BEAMS_OUTLINE)) {
          map.setPaintProperty(LAYER_BEAMS_OUTLINE, "line-opacity", 0.8);
          map.setPaintProperty(LAYER_BEAMS_OUTLINE, "line-width", 1.5);
        }

        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }

        const srcCells = map.getSource(SRC_VORONOI_CELLS) as maplibregl.GeoJSONSource | undefined;
        if (srcCells) {
          if (showVoronoi && sites.length >= 3) {
            void engineVoronoiCells(sites).then((features) => {
              if (mapRef.current !== map) return;
              srcCells.setData(
                featureCollection(features ?? computeAllVoronoiPolygons(sites)),
              );
            });
          } else {
            srcCells.setData(featureCollection([]));
          }
        }
        return;
      }

      // Display the selected source site's name prominently on the map
      if (map.getLayer(LAYER_SITES_SELECTED_LABEL)) {
        map.setFilter(
          LAYER_SITES_SELECTED_LABEL,
          selectedSite ? ["==", ["get", "id"], selectedSite] : ["==", ["get", "id"], ""],
        );
      }

      const selected = selectedSite ? sitesById.get(selectedSite) : null;
      const siteData = selectedSite ? sitesWithNeighborsById.get(selectedSite) : null;
      const neighborIds = (siteData?.neighbors || []).map((n) => n.to);
      const relatedIds = [selectedSite, ...neighborIds];

      // Neighbor sites labels
      if (map.getLayer(LAYER_LABELS)) {
        map.setFilter(
          LAYER_LABELS,
          neighborIds.length > 0
            ? ["in", ["get", "id"], ["literal", neighborIds]]
            : ["==", ["get", "id"], ""],
        );
        map.setLayoutProperty(LAYER_LABELS, "visibility", "visible");
      }

      // 1. Highlight selected site
      map.setFilter(
        LAYER_SITES_SELECTED,
        selectedSite ? ["==", ["get", "id"], selectedSite] : ["==", ["get", "id"], ""],
      );

      // 2. Highlight neighbor sites
      map.setFilter(
        LAYER_SITES_NEIGHBORS,
        neighborIds.length > 0
          ? ["in", ["get", "id"], ["literal", neighborIds]]
          : ["==", ["get", "id"], ""],
      );

      // 3. Dim unrelated sites, keep related sites at full opacity; make center point blank inside for voronoi
      map.setPaintProperty(LAYER_SITES, "circle-color", listedNeighbors ? [
        "case",
        ["==", ["get", "id"], selectedSite], iconColor,
        ["in", ["get", "id"], ["literal", neighborIds]], neighborIconColor,
        otherSiteColor,
      ] : [
        "case",
        ["==", ["get", "id"], selectedSite],
        calcMethod === "voronoi" ? "transparent" : ["get", "color"],
        ["get", "color"],
      ]);
      map.setPaintProperty(LAYER_SITES, "circle-opacity", [
        "case",
        ["in", ["get", "id"], ["literal", relatedIds]],
        1,
        listedNeighbors ? 0.55 : 0.2,
      ]);
      map.setPaintProperty(LAYER_SITES, "circle-stroke-opacity", [
        "case",
        ["in", ["get", "id"], ["literal", relatedIds]],
        1,
        listedNeighbors ? 0.55 : 0.2,
      ]);

      // 4. Highlight connections for selected site strictly matching true neighbors
      if (calcMethod !== "voronoi" && map.getLayer(LAYER_CONNECTIONS)) {
        const connFilter =
          neighborIds.length > 0
            ? [
                "all",
                ["==", ["get", "from"], selectedSite],
                ["in", ["get", "to"], ["literal", neighborIds]],
              ]
            : ["==", ["get", "from"], ""];

        map.setFilter(LAYER_CONNECTIONS, connFilter as any);
        map.setPaintProperty(LAYER_CONNECTIONS, "line-opacity", listedNeighbors ? lineOpacity / 100 : 1);
        map.setPaintProperty(
          LAYER_CONNECTIONS,
          "line-width",
          Math.max(lineThickness * 1.6, 2.5),
        );
      }

      if (map.getLayer(LAYER_CONN_LABELS)) {
        if (faceMode && neighborIds.length > 0) {
          map.setFilter(LAYER_CONN_LABELS, [
            "all",
            ["==", ["get", "from"], selectedSite],
            ["in", ["get", "to"], ["literal", neighborIds]],
          ]);
          map.setLayoutProperty(LAYER_CONN_LABELS, "visibility", "visible");
        } else {
          map.setFilter(LAYER_CONN_LABELS, ["==", ["get", "from"], ""]);
          map.setLayoutProperty(LAYER_CONN_LABELS, "visibility", "none");
        }
      }

      if (map.getLayer(LAYER_BEAMS_FILL)) {
        map.setPaintProperty(LAYER_BEAMS_FILL, "fill-opacity", [
          "case",
          ["==", ["get", "siteId"], selectedSite],
          0.35,
          0.08,
        ]);
      }
      if (map.getLayer(LAYER_BEAMS_OUTLINE)) {
        map.setPaintProperty(LAYER_BEAMS_OUTLINE, "line-opacity", [
          "case",
          ["==", ["get", "siteId"], selectedSite],
          1.0,
          0.15,
        ]);
        map.setPaintProperty(LAYER_BEAMS_OUTLINE, "line-width", [
          "case",
          ["==", ["get", "siteId"], selectedSite],
          2.5,
          1.2,
        ]);
      }

      if (selected) {
        if (selectedSite !== prevSelectedSiteRef.current) {
          prevSelectedSiteRef.current = selectedSite;
          fitSiteAndNeighbors(selectedSite);
        }

        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      }

      // Draw Voronoi cell polygons for selected site and its neighbors if voronoi method active
      if (calcMethod === "voronoi" && selectedSite) {
        const neighborLayerMap = new Map<string, number>();
        neighborLayerMap.set(selectedSite, 0);
        (siteData?.neighbors || []).forEach((n) => {
          neighborLayerMap.set(n.to, n.layer || 1);
        });

        const srcCells = map.getSource(SRC_VORONOI_CELLS) as maplibregl.GeoJSONSource | undefined;
        const colorFor = (nid: string) => {
          if (nid === selectedSite) return "transparent";
          const layerNum = neighborLayerMap.get(nid) ?? 1;
          return LAYER_COLORS[(layerNum - 1) % LAYER_COLORS.length];
        };

        void engineCellsFor(sites, [...neighborLayerMap.keys()]).then(
          (engineFeatures) => {
            if (!srcCells || mapRef.current !== map) return;
            if (engineFeatures) {
              srcCells.setData(
                featureCollection(
                  engineFeatures.map((f) => {
                    const nid = String(f.properties?.siteId ?? "");
                    return {
                      ...f,
                      properties: {
                        siteId: nid,
                        layer: neighborLayerMap.get(nid) ?? 1,
                        color: colorFor(nid),
                      },
                    };
                  }),
                ),
              );
              return;
            }
            const pts = sites.map((s) => ({ x: s.lng, y: s.lat }));
            const siteIdxMap = new Map(sites.map((s, i) => [s.id, i]));
            const triangles = computeDelaunay(pts);
            const vIndex = buildVoronoiIndex(triangles, pts);
            const cellFeatures: GeoJSON.Feature[] = [];
            neighborLayerMap.forEach((layerNum, nid) => {
              const idx = siteIdxMap.get(nid);
              if (idx === undefined) return;
              const polyVertices = computeVoronoiCellPolygon(
                triangles,
                pts,
                idx,
                vIndex,
              );
              if (polyVertices.length < 3) return;
              const coordinates = [
                ...polyVertices.map((p) => [p.lng, p.lat]),
                [polyVertices[0].lng, polyVertices[0].lat],
              ];
              cellFeatures.push(
                turfPolygon([coordinates], {
                  siteId: nid,
                  layer: layerNum,
                  color: colorFor(nid),
                }),
              );
            });
            srcCells.setData(featureCollection(cellFeatures));
          },
        );
      }
    } catch (e) {
      console.warn("Could not apply selection to map:", e);
    }
  }, [
    selectedSite,
    sites,
    sitesById,
    calcMethod,
    sitesWithNeighborsById,
    singleIconMode,
    voronoiLayers,
    showVoronoi,
    lineThickness,
    lineOpacity,
    lineColor,
    faceMode,
    listedNeighbors,
    filteredSourceIds,
    otherSiteColor,
    iconColor,
    neighborIconColor,
    fitSiteAndNeighbors,
  ]);

  const showLabelsRef = useRef(showSiteLabels);
  showLabelsRef.current = showSiteLabels;

  const applyLabels = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LAYER_LABELS)) return;
    try {
      if (selectedSite && !filteredSourceIds) {
        const siteData = sitesWithNeighborsById.get(selectedSite);
        const neighborIds = (siteData?.neighbors || []).map((n) => n.to);
        map.setFilter(
          LAYER_LABELS,
          neighborIds.length > 0
            ? ["in", ["get", "id"], ["literal", neighborIds]]
            : ["==", ["get", "id"], ""],
        );
        map.setLayoutProperty(LAYER_LABELS, "visibility", "visible");
      } else {
        map.setFilter(LAYER_LABELS, null);
        map.setLayoutProperty(
          LAYER_LABELS,
          "visibility",
          showLabelsRef.current && sites.length > 0 ? "visible" : "none",
        );
      }
    } catch {
      // safe ignore
    }
  }, [sites.length, selectedSite, sitesWithNeighborsById, filteredSourceIds]);

  const applySitesDataRef = useRef(applySitesData);
  applySitesDataRef.current = applySitesData;
  const applySitesPaintAndCameraRef = useRef(applySitesPaintAndCamera);
  applySitesPaintAndCameraRef.current = applySitesPaintAndCamera;
  const applyConnectionsDataRef = useRef(applyConnectionsData);
  applyConnectionsDataRef.current = applyConnectionsData;
  const applyConnectionsPaintRef = useRef(applyConnectionsPaint);
  applyConnectionsPaintRef.current = applyConnectionsPaint;
  const applyVoronoiDataRef = useRef(applyVoronoiData);
  applyVoronoiDataRef.current = applyVoronoiData;
  const applyBeamDataRef = useRef(applyBeamData);
  applyBeamDataRef.current = applyBeamData;
  const applySelectionRef = useRef(applySelection);
  applySelectionRef.current = applySelection;
  const applyLabelsRef = useRef(applyLabels);
  applyLabelsRef.current = applyLabels;

  /* ----------------------------------------------------------------- init */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const basemap = BASEMAP_BY_ID[mapStyle] ?? BASEMAP_BY_ID[DEFAULT_MAP_LAYER];

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [96.1951, 16.8661],
      zoom: 11,
      attributionControl: false,
      style: {
        version: 8,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
        sources: {
          [BASEMAP_SRC]: {
            type: "raster",
            tiles: [basemap.url],
            tileSize: basemap.tileSize,
            attribution: basemap.attribution,
            maxzoom: basemap.maxZoom,
          },
        },
        layers: [
          {
            id: BASEMAP_LAYER,
            type: "raster",
            source: BASEMAP_SRC,
          },
        ],
      },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    map.on("load", () => {
      // 1. Voronoi cells polygon layer (background)
      map.addSource(SRC_VORONOI_CELLS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        buffer: 0,
      });
      map.addLayer({
        id: LAYER_VORONOI_CELLS_FILL,
        type: "fill",
        source: SRC_VORONOI_CELLS,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.2,
        },
      });
      map.addLayer({
        id: LAYER_VORONOI_CELLS_OUTLINE,
        type: "line",
        source: SRC_VORONOI_CELLS,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "color"], "transparent"],
            "#10b981",
            ["get", "color"],
          ],
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      // 1b. Sector beam polygons (background wedges under connections)
      map.addSource(SRC_BEAMS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: LAYER_BEAMS_FILL,
        type: "fill",
        source: SRC_BEAMS,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.16,
        },
      });
      map.addLayer({
        id: LAYER_BEAMS_OUTLINE,
        type: "line",
        source: SRC_BEAMS,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": {
            type: "identity",
            property: "opacity",
          },
          "line-dasharray": [
            "case",
            ["get", "matched"],
            ["literal", [1, 0]],
            ["literal", [3, 2]],
          ],
        },
      });


      // 2. Connections layer (lines)
      map.addSource(SRC_CONNECTIONS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        buffer: 0,
        tolerance: 0.5,
      });
      map.addLayer({
        id: LAYER_CONNECTIONS,
        type: "line",
        source: SRC_CONNECTIONS,
        paint: {
          "line-color": lineColor,
          "line-width": lineThickness,
          "line-opacity": lineOpacity / 100,
        },
      });

      // 2b. Connection distance labels (face-to-face mode only)
      map.addSource(SRC_CONN_LABELS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        buffer: 0,
      });
      map.addLayer({
        id: LAYER_CONN_LABELS,
        type: "symbol",
        source: SRC_CONN_LABELS,
        layout: {
          visibility: "none",
          "symbol-placement": "point",
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(15, 23, 42, 0.9)",
          "text-halo-width": 1.5,
        },
      });

      // 4. Sites layer (circles)
      map.addSource(SRC_SITES, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        buffer: 0,
      });
      map.addLayer({
        id: LAYER_SITES,
        type: "circle",
        source: SRC_SITES,
        paint: {
          "circle-radius": radius,
          "circle-color": ["get", "color"],
          "circle-opacity": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      // Neighbor sites highlight ring layer (for related neighbors of selected site)
      map.addLayer({
        id: LAYER_SITES_NEIGHBORS,
        type: "circle",
        source: SRC_SITES,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": radius * 1.5,
          "circle-color": "transparent",
          "circle-stroke-color": "#f59e0b",
          "circle-stroke-width": 2.5,
          "circle-stroke-opacity": 0.95,
        },
      });

      // Selected site highlight ring layer (hollow center point)
      map.addLayer({
        id: LAYER_SITES_SELECTED,
        type: "circle",
        source: SRC_SITES,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": radius * 1.8,
          "circle-color": "transparent",
          "circle-stroke-color": "#10b981",
          "circle-stroke-width": 3.5,
        },
      });

      // 5. Labels layer
      map.addLayer({
        id: LAYER_LABELS,
        type: "symbol",
        source: SRC_SITES,
        layout: {
          "text-field": ["get", "id"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 12,
          "text-variable-anchor": ["bottom", "top", "left", "right"],
          "text-radial-offset": 0.9,
          "text-justify": "auto",
          "text-padding": 3,
          "text-allow-overlap": false,
          "symbol-sort-key": ["get", "labelPriority"],
          visibility: "none",
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      // 6. Selected source site prominent label layer (always visible, crisp white halo)
      map.addLayer({
        id: LAYER_SITES_SELECTED_LABEL,
        type: "symbol",
        source: SRC_SITES,
        filter: ["==", ["get", "id"], ""],
        layout: {
          "text-field": ["get", "id"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 13,
          "text-anchor": "bottom",
          "text-offset": [0, -1.0],
          "text-allow-overlap": true,
          "text-ignore-placement": false,
          "text-padding": 4,
          visibility: "visible",
        },
        paint: {
          "text-color": "#064e3b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      // Click handler on sector beam visuals (both fill and outline)
      const handleBeamClick = (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const rawId = feature.properties?.siteId ?? feature.properties?.id;
        if (rawId === undefined || rawId === null) return;
        const siteId = String(rawId).trim();
        if (!siteId) return;

        // Ensure details drawer is open and site is selected
        setDrawerOpenRef.current(true);
        onSiteClickRef.current(siteId);
      };

      if (map.getLayer(LAYER_BEAMS_FILL)) {
        map.on("click", LAYER_BEAMS_FILL, handleBeamClick);
      }
      if (map.getLayer(LAYER_BEAMS_OUTLINE)) {
        map.on("click", LAYER_BEAMS_OUTLINE, handleBeamClick);
      }

      // Click handler on site points
      const handleSiteClick = (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const rawId = feature.properties?.id ?? feature.properties?.siteId;
        if (rawId === undefined || rawId === null) return;
        const siteId = String(rawId).trim();
        if (!siteId) return;

        if (selectedSiteRef.current === siteId) {
          onSiteClickRef.current(null);
        } else {
          setDrawerOpenRef.current(true);
          onSiteClickRef.current(siteId);
        }
      };

      const siteClickLayers = [
        LAYER_SITES,
        LAYER_SITES_SELECTED,
        LAYER_SITES_NEIGHBORS,
        LAYER_SITES_SELECTED_LABEL,
      ];
      siteClickLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.on("click", layerId, handleSiteClick);
        }
      });

      // General map click handler: fallback hit-testing with 6px buffer or deselect on background
      map.on("click", (e) => {
        const target = e.originalEvent?.target as HTMLElement | null;
        if (target && target.closest(".maplibregl-popup")) {
          return;
        }

        // Bounding box around click point for generous touch/mouse hit testing
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 6, e.point.y - 6],
          [e.point.x + 6, e.point.y + 6],
        ];

        // 1. Check if a site circle was clicked
        const features = map.queryRenderedFeatures(bbox, {
          layers: [
            LAYER_SITES,
            LAYER_SITES_SELECTED,
            LAYER_SITES_NEIGHBORS,
            LAYER_SITES_SELECTED_LABEL,
          ],
        });

        if (features && features.length > 0) {
          const rawId = features[0].properties?.id ?? features[0].properties?.siteId;
          if (rawId !== undefined && rawId !== null) {
            const siteId = String(rawId).trim();
            if (siteId) {
              if (selectedSiteRef.current === siteId) {
                onSiteClickRef.current(null);
              } else {
                setDrawerOpenRef.current(true);
                onSiteClickRef.current(siteId);
              }
              return;
            }
          }
        }

        // 2. Check if a sector beam polygon was clicked
        if (map.getLayer(LAYER_BEAMS_FILL)) {
          const beamFeatures = map.queryRenderedFeatures(bbox, {
            layers: [LAYER_BEAMS_FILL, LAYER_BEAMS_OUTLINE],
          });

          if (beamFeatures && beamFeatures.length > 0) {
            const rawId = beamFeatures[0].properties?.siteId ?? beamFeatures[0].properties?.id;
            if (rawId !== undefined && rawId !== null) {
              const siteId = String(rawId).trim();
              if (siteId) {
                setDrawerOpenRef.current(true);
                onSiteClickRef.current(siteId);
                return;
              }
            }
          }
        }

        // Clicked empty background outside any site or sector beam -> unselect
        if (selectedSiteRef.current) {
          onSiteClickRef.current(null);
        }
      });

      const interactiveSiteLayers = [
        LAYER_SITES,
        LAYER_SITES_SELECTED,
        LAYER_SITES_NEIGHBORS,
        LAYER_SITES_SELECTED_LABEL,
        LAYER_BEAMS_FILL,
        LAYER_BEAMS_OUTLINE,
      ];
      interactiveSiteLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      });

      // Synchronously populate initial data, paint, selection and camera
      applySitesDataRef.current();
      applyConnectionsDataRef.current();
      applyBeamDataRef.current();
      applySitesPaintAndCameraRef.current();
      applyConnectionsPaintRef.current();
      applyVoronoiDataRef.current();
      applySelectionRef.current();
      applyLabelsRef.current();
    });

    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current!);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------- sidebar resize */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.resize(), 320);
    return () => clearTimeout(t);
  }, [sidebarOpen]);

  /* ---------------------------------------------------------- basemap */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const cfg = BASEMAP_BY_ID[mapStyle] ?? BASEMAP_BY_ID[DEFAULT_MAP_LAYER];

    const src = map.getSource(BASEMAP_SRC) as
      | maplibregl.RasterTileSource
      | undefined;
    if (!src) return;

    map.removeLayer(BASEMAP_LAYER);
    map.removeSource(BASEMAP_SRC);

    map.addSource(BASEMAP_SRC, {
      type: "raster",
      tiles: [cfg.url],
      tileSize: cfg.tileSize,
      attribution: cfg.attribution,
      maxzoom: cfg.maxZoom,
    });
    map.addLayer(
      {
        id: BASEMAP_LAYER,
        type: "raster",
        source: BASEMAP_SRC,
      },
      LAYER_VORONOI_CELLS_FILL,
    );
  }, [mapStyle]);

  /* ----------------------------------------------------------- sites data */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SRC_SITES)) {
      applySitesData();
    } else {
      map.once("load", applySitesData);
    }
  }, [applySitesData]);

  /* --------------------------------------------------- sites paint + camera */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(LAYER_SITES)) {
      applySitesPaintAndCamera();
    } else {
      map.once("load", applySitesPaintAndCamera);
    }
  }, [applySitesPaintAndCamera]);

  /* ----------------------------------------------------- connections data */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SRC_CONNECTIONS)) {
      applyConnectionsData();
    } else {
      map.once("load", applyConnectionsData);
    }
  }, [applyConnectionsData]);

  /* ------------------------------------------------- connections paint only */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(LAYER_CONNECTIONS)) {
      applyConnectionsPaint();
    } else {
      map.once("load", applyConnectionsPaint);
    }
  }, [applyConnectionsPaint]);

  /* ---------------------------------------------------- voronoi polygons data */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SRC_VORONOI_CELLS)) {
      applyVoronoiData();
    } else {
      map.once("load", applyVoronoiData);
    }
  }, [applyVoronoiData]);

  /* ---------------------------------------------------------- beam polygons */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SRC_BEAMS)) {
      applyBeamData();
    } else {
      map.once("load", applyBeamData);
    }
  }, [applyBeamData]);

  /* ------------------------------------------- selection & cell highlight */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(LAYER_SITES)) {
      applySelection();
    } else {
      map.once("load", applySelection);
    }
  }, [applySelection]);

  /* ----------------------------------------------------------- labels */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(LAYER_LABELS)) {
      applyLabels();
    } else {
      map.once("load", applyLabels);
    }
  }, [applyLabels, showSiteLabels]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div ref={containerRef} id="map" style={{ width: "100%", height: "100%" }} />
      {boxZoom && <BoxZoomOverlay
        onCancel={onBoxZoomEnd}
        onZoom={(left, top, right, bottom) => {
          const map = mapRef.current;
          if (map) {
            const bounds = new maplibregl.LngLatBounds();
            for (const corner of [[left, top], [right, top], [right, bottom], [left, bottom]] as [number, number][]) {
              bounds.extend(map.unproject(corner));
            }
            map.fitBounds(bounds, { padding: 24, maxZoom: 19, duration: 400 });
          }
          onBoxZoomEnd?.();
        }}
      />}

      {/* Floating Re-Open Button when drawer is closed and a site is selected */}
      {selectedSite && !drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          className="site-details-reopen-btn"
          title="Open site details drawer"
          type="button"
        >
          <span
            className="dot"
            style={{
              background:
                !singleIconMode && selectedSiteObj?.isTarget && !selectedSiteObj?.isSource
                  ? neighborIconColor
                  : iconColor,
            }}
          />
          <strong>{selectedSite}</strong>
          {selectedSiteData?.neighbors && selectedSiteData.neighbors.length > 0 && (
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500, margin: "0 2px" }}>
              {`${selectedSiteData.neighbors.length} neighbor${selectedSiteData.neighbors.length !== 1 ? "s" : ""}${listedNeighbors ? "" : " in beam"}`}
            </span>
          )}
          <span className="badge">Details &rarr;</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSiteClickRef.current(null);
            }}
            title="Deselect"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: "50%",
              marginLeft: 4,
              cursor: "pointer",
              color: "#94a3b8",
              fontSize: 14,
              lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            &times;
          </span>
        </button>
      )}

      {/* Slide-out Site Details Drawer */}
      {drawerOpen && selectedSiteObj && (
        <aside className={`site-details-drawer${listedNeighbors ? " listed-neighbors-drawer" : ""}`}>
          <div className="site-details-header">
            <div className="site-details-title-wrap">
              <span
                className="site-details-dot"
                style={{
                  background:
                    !singleIconMode && selectedSiteObj.isTarget && !selectedSiteObj.isSource
                      ? neighborIconColor
                      : iconColor,
                }}
              />
              <div>
                <h3 className="site-details-title">{selectedSiteObj.id}</h3>
                <span className="site-details-coords">
                  {selectedSiteObj.lat.toFixed(5)}, {selectedSiteObj.lng.toFixed(5)}
                </span>
                {selectedSiteObj.azimuth !== undefined && (
                  <span className="site-details-coords">
                    Azimuth {selectedSiteObj.azimuth}° &middot; {beamWidth}° beam
                    {selectedSiteObj.radius !== undefined &&
                      ` &middot; Range ${selectedSiteObj.radius} ${distanceUnit}`}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="site-details-close-btn"
              title="Close drawer"
              aria-label="Close drawer"
              type="button"
            >
              &times;
            </button>
          </div>

          <div className="site-details-body">
            {/* Mapped Fields / Attributes */}
            {selectedSiteObj.originalData && drawerCols.length > 0 && (
              <div className="site-details-section">
                <div className="site-details-section-title">Site Attributes</div>
                <div className="site-details-grid">
                  {drawerCols.map((col: string) => {
                    const val = selectedSiteObj.originalData?.[col];
                    if (val === undefined || val === null || val === "") return null;
                    return (
                      <div key={col} className="site-details-field">
                        <span className="site-details-field-k">{col}</span>
                        <span className="site-details-field-v" title={String(val)}>
                          {String(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sector / Nearest Neighbors */}
            <div className="site-details-section">
              <div className="site-details-section-title">
                {listedNeighbors
                  ? `Listed neighbours (${selectedNeighbors.length})`
                  : calcMethod === "face"
                  ? `Face-to-Face Connections (${selectedNeighbors.length})`
                  : calcMethod === "voronoi"
                    ? `Voronoi Neighbors (${voronoiLayers} Layer${voronoiLayers > 1 ? "s" : ""})`
                    : `Nearest Neighbors in ${beamWidth}° Beam (${selectedNeighbors.length})`}
              </div>

              {selectedNeighbors.length === 0 ? (
                <div className="site-details-empty">
                  {listedNeighbors ? "No outgoing neighbour links for this site." : "No neighbors calculated for this site."}
                </div>
              ) : calcMethod === "voronoi" ? (
                // Grouped by layer
                <div className="site-details-layer-groups">
                  {layerNumbers.map((layerNum: number) => {
                    const layerColor = LAYER_COLORS[(layerNum - 1) % LAYER_COLORS.length];
                    const group = selectedNeighbors.filter((n: NeighborResult) => (n.layer || 1) === layerNum);
                    return (
                      <div key={layerNum} className="site-details-layer-group">
                        <div
                          className="site-details-layer-badge"
                          style={{
                            borderColor: layerColor,
                            color: layerColor,
                            backgroundColor: `${layerColor}18`,
                          }}
                        >
                          Layer {layerNum} &middot; {group.length} site{group.length > 1 ? "s" : ""}
                        </div>
                        <div className="site-details-neighbor-list">
                          {group.map((n: NeighborResult) => (
                            <div
                              key={n.to}
                              className="site-details-neighbor-row"
                              onClick={() => onSiteClick(n.to)}
                              title={`Click to inspect ${n.to}`}
                            >
                              <strong className="site-details-neighbor-id">{n.to}</strong>
                              <span className="site-details-neighbor-dist">
                                {(n.dist || 0).toFixed(3)} {distanceUnit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Standard list
                <div className="site-details-neighbor-list">
                  {selectedNeighbors.map((n: NeighborResult, idx: number) => (
                    <div
                      key={n.to}
                      className="site-details-neighbor-row"
                      onClick={() => onSiteClick(n.to)}
                      title={`Click to inspect ${n.to}`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="site-details-neighbor-rank">#{idx + 1}</span>
                        <strong className="site-details-neighbor-id">{n.to}</strong>
                      </div>
                      <span className="site-details-neighbor-dist">
                        {(n.dist || 0).toFixed(3)} {distanceUnit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function BoxZoomOverlay({
  onZoom,
  onCancel,
}: {
  onZoom: (left: number, top: number, right: number, bottom: number) => void;
  onCancel?: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
  };
  const rectangle = (origin: { x: number; y: number }, end: { x: number; y: number }) => ({
    left: Math.min(origin.x, end.x),
    top: Math.min(origin.y, end.y),
    width: Math.abs(origin.x - end.x),
    height: Math.abs(origin.y - end.y),
  });

  return (
    <div
      className="box-zoom-overlay"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        start.current = point(event);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.isPrimary && start.current) setBox(rectangle(start.current, point(event)));
      }}
      onPointerUp={(event) => {
        if (!event.isPrimary || !start.current) return;
        const { left, top, width, height } = rectangle(start.current, point(event));
        start.current = null;
        setBox(null);
        if (width >= 8 && height >= 8) onZoom(left, top, left + width, top + height);
      }}
      onPointerCancel={onCancel}
      aria-hidden="true"
    >
      {box && <div className="box-zoom-rectangle" style={box} />}
    </div>
  );
}
