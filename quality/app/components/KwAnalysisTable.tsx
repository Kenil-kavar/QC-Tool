"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */
interface KwMeta {
  platforms: string[];
  keywords: string[];
  pincodes: string[];
  locations: string[];
  dates: string[]; // "YYYY-MM-DD"
}

interface MonthGroup {
  key: string;
  label: string;
  days: string[];
}

interface KwMetrics {
  count: number;
  max_rank: number;
  min_rank: number;
}

interface KwData {
  metrics: Record<string, KwMetrics>; // date → metrics
}

interface DimensionRow {
  dimension: "platform" | "keyword" | "pincode" | "location";
  label: string;
  value?: string;
  isHeader: boolean;
}

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */
const MONTH_NAMES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1]}-${year.slice(2)}`;
}

function formatDayLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  const day = d.getDate().toString().padStart(2, "0");
  const mon = MONTH_NAMES[d.getMonth()];
  return `${day}-${mon}`;
}

function groupDatesByMonth(dates: string[]): MonthGroup[] {
  const map = new Map<string, string[]>();
  for (const d of dates) {
    const key = d.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  const groups: MonthGroup[] = [];
  for (const [key, days] of map) {
    groups.push({ key, label: formatMonthLabel(key), days: days.sort() });
  }
  return groups.sort((a, b) => a.key.localeCompare(b.key));
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-IN");
}

/* ═══════════════════════════════════════════
   Component
   ═══════════════════════════════════════════ */
export default function KwAnalysisTable({ db }: { db: string }) {
  const [meta, setMeta] = useState<KwMeta | null>(null);
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Cache: key = "dimension|value" → KwData
  const [dataCache, setDataCache] = useState<Record<string, KwData>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  // ── Fetch meta ──
  useEffect(() => {
    fetch(`/api/kw-analysis?type=meta&db=${encodeURIComponent(db)}`)
      .then((r) => r.json())
      .then((data: KwMeta) => {
        setMeta(data);
        setMonthGroups(groupDatesByMonth(data.dates));
        if (data.dates.length > 0) {
          const firstMonth = data.dates[0].slice(0, 7);
          setExpandedMonths(new Set([firstMonth]));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch KW meta:", err);
        setLoading(false);
      });
  }, [db]);

  // ── Fetch data for a cache key ──
  const fetchData = useCallback(
    async (dimension: string, value?: string) => {
      const cacheKey = `${dimension}|${value || ""}`;
      if (dataCache[cacheKey] || loadingKeys.has(cacheKey)) return;

      setLoadingKeys((prev) => new Set(prev).add(cacheKey));

      let url = `/api/kw-analysis?type=data&dimension=${dimension}&db=${encodeURIComponent(db)}`;
      if (value) url += `&value=${encodeURIComponent(value)}`;

      try {
        const res = await fetch(url);
        const data = await res.json();
        setDataCache((prev) => ({ ...prev, [cacheKey]: data }));
      } catch (err) {
        console.error(`Failed to fetch ${cacheKey}:`, err);
      } finally {
        setLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(cacheKey);
          return next;
        });
      }
    },
    [db, dataCache, loadingKeys]
  );

  // ── Fetch header-level data on mount ──
  useEffect(() => {
    if (!meta) return;
    fetchData("platform");
    fetchData("keyword");
    fetchData("pincode");
    fetchData("location");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  // ── Build rows ──
  const rows = useMemo<DimensionRow[]>(() => {
    if (!meta) return [];
    const result: DimensionRow[] = [];

    // Platform
    result.push({ dimension: "platform", label: "Platform", isHeader: true });
    if (expandedDimensions.has("platform")) {
      for (const p of meta.platforms) {
        result.push({ dimension: "platform", label: p, value: p, isHeader: false });
      }
    }

    // Keyword
    result.push({ dimension: "keyword", label: "Keyword", isHeader: true });
    if (expandedDimensions.has("keyword")) {
      for (const k of meta.keywords) {
        result.push({ dimension: "keyword", label: k, value: k, isHeader: false });
      }
    }

    // Pincode
    result.push({ dimension: "pincode", label: "Pincode", isHeader: true });
    if (expandedDimensions.has("pincode")) {
      for (const p of meta.pincodes) {
        result.push({ dimension: "pincode", label: p, value: p, isHeader: false });
      }
    }

    // Location
    result.push({ dimension: "location", label: "Location", isHeader: true });
    if (expandedDimensions.has("location")) {
      for (const l of meta.locations) {
        result.push({ dimension: "location", label: l, value: l, isHeader: false });
      }
    }

    return result;
  }, [meta, expandedDimensions]);

  // ── Toggle month expansion ──
  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Toggle dimension expansion ──
  const toggleDimension = (dim: string) => {
    setExpandedDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) {
        next.delete(dim);
      } else {
        next.add(dim);
        if (meta) {
          const values =
            dim === "platform"
              ? meta.platforms
              : dim === "keyword"
                ? meta.keywords
                : dim === "pincode"
                  ? meta.pincodes
                  : meta.locations;
          for (const v of values) {
            fetchData(dim, v);
          }
        }
      }
      return next;
    });
  };

  // ── Get metrics for single date ──
  const getMetrics = (row: DimensionRow, date: string): KwMetrics | null => {
    const cacheKey = `${row.dimension}|${row.value || ""}`;
    const cached = dataCache[cacheKey];
    if (!cached) return null;
    return cached.metrics[date] || null;
  };

  // ── Aggregate metrics for a month ──
  const getMonthMetrics = (row: DimensionRow, days: string[]): KwMetrics | null => {
    const cacheKey = `${row.dimension}|${row.value || ""}`;
    const cached = dataCache[cacheKey];
    if (!cached) return null;

    let totalCount = 0;
    let maxRank = -Infinity;
    let minRank = Infinity;
    let hasAny = false;

    for (const day of days) {
      const m = cached.metrics[day];
      if (m) {
        totalCount += m.count;
        if (m.max_rank > maxRank) maxRank = m.max_rank;
        if (m.min_rank < minRank) minRank = m.min_rank;
        hasAny = true;
      }
    }

    if (!hasAny) return null;
    return { count: totalCount, max_rank: maxRank, min_rank: minRank };
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="table-loading">
        <div className="loading-spinner" />
        <span>Loading keyword data...</span>
      </div>
    );
  }

  if (!meta) {
    return <div className="table-error">Failed to load keyword metadata</div>;
  }

  return (
    <div className="analysis-table-wrapper">
      <div className="table-header-bar">
        <div className="header-badge-title">
          <span className="dot-indicator dot-purple" />
          <h2 className="table-title">Keyword Search Rank Analysis</h2>
        </div>
        <p className="table-subtitle">
          Count, Max Rank & Min Rank from <strong>rb_kw_week</strong> by Platform, Keyword, Pincode, and Location
        </p>
      </div>
      <div className="table-scroll-container">
        <table className="analysis-table">
          <thead>
            {/* Top Header Row: Dimension & Month Names */}
            <tr className="month-header-row">
              <th rowSpan={2} className="sticky-col dimension-header">
                Dimension
              </th>
              {monthGroups.map((mg) => {
                const isExpanded = expandedMonths.has(mg.key);
                return (
                  <th
                    key={mg.key}
                    colSpan={isExpanded ? mg.days.length : 1}
                    className={`month-header-cell ${isExpanded ? "expanded" : "collapsed"}`}
                    onClick={() => toggleMonth(mg.key)}
                  >
                    <div className="month-header-content">
                      <span className="calendar-icon">📅</span>
                      <span className="month-name-text">{mg.label}</span>
                      <span className="month-toggle-arrow">
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* Bottom Header Row: Day Names / Total */}
            <tr className="day-header-row">
              {monthGroups.map((mg) => {
                const isExpanded = expandedMonths.has(mg.key);
                if (isExpanded) {
                  return mg.days.map((day) => (
                    <th key={day} className="day-header-cell">
                      <span className="day-label-text">{formatDayLabel(day)}</span>
                    </th>
                  ));
                } else {
                  return (
                    <th key={`${mg.key}-total`} className="total-header-cell">
                      <span className="total-label-text">AGG / TOTAL</span>
                    </th>
                  );
                }
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isExpanded =
                row.isHeader && expandedDimensions.has(row.dimension);
              const isChildRow = !row.isHeader;
              const isLoading = loadingKeys.has(
                `${row.dimension}|${row.value || ""}`
              );

              return (
                <tr
                  key={`${row.dimension}-${row.value || "header"}-${idx}`}
                  className={`
                    ${row.isHeader ? "header-row" : "child-row"}
                    ${isExpanded ? "expanded" : ""}
                  `}
                >
                  <td
                    className={`sticky-col dimension-cell ${row.isHeader ? "header-cell" : "child-cell"}`}
                    onClick={
                      row.isHeader
                        ? () => toggleDimension(row.dimension)
                        : undefined
                    }
                    style={row.isHeader ? { cursor: "pointer" } : undefined}
                  >
                    <div
                      className="dimension-cell-content"
                      style={{ paddingLeft: isChildRow ? "24px" : "8px" }}
                    >
                      {row.isHeader && (
                        <span className={`row-chevron ${isExpanded ? "rotated" : ""}`}>
                          ▶
                        </span>
                      )}
                      {isChildRow && (
                        <span className="child-connector">└─</span>
                      )}
                      <span className={row.isHeader ? "dimension-name" : "child-name"}>
                        {row.label}
                      </span>
                    </div>
                  </td>

                  {/* Data cells */}
                  {monthGroups.map((mg) => {
                    const isMonthExpanded = expandedMonths.has(mg.key);

                    if (isMonthExpanded) {
                      return mg.days.map((day) => {
                        const m = getMetrics(row, day);
                        return (
                          <td key={day} className="data-cell day-data-cell">
                            {isLoading ? (
                              <span className="cell-loading">...</span>
                            ) : m ? (
                              <KwMetricsBadges metrics={m} />
                            ) : (
                              <span className="cell-empty">—</span>
                            )}
                          </td>
                        );
                      });
                    } else {
                      const m = getMonthMetrics(row, mg.days);
                      return (
                        <td key={mg.key} className="data-cell month-data-cell">
                          {isLoading ? (
                            <span className="cell-loading">...</span>
                          ) : m ? (
                            <KwMetricsBadges metrics={m} />
                          ) : (
                            <span className="cell-empty">—</span>
                          )}
                        </td>
                      );
                    }
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Metrics Badges sub-component
   ═══════════════════════════════════════════ */
function KwMetricsBadges({ metrics }: { metrics: KwMetrics }) {
  return (
    <div className="kw-metrics-grid">
      <div className="kw-metric-pill kw-pill-count">
        <span className="kw-pill-indicator" />
        <span className="kw-pill-label">Count</span>
        <span className="kw-pill-value">{formatNumber(metrics.count)}</span>
      </div>
      <div className="kw-metric-pill kw-pill-max">
        <span className="kw-pill-indicator" />
        <span className="kw-pill-label">Max Rank</span>
        <span className="kw-pill-value">{formatNumber(metrics.max_rank)}</span>
      </div>
      <div className="kw-metric-pill kw-pill-min">
        <span className="kw-pill-indicator" />
        <span className="kw-pill-label">Min Rank</span>
        <span className="kw-pill-value">{formatNumber(metrics.min_rank)}</span>
      </div>
    </div>
  );
}
