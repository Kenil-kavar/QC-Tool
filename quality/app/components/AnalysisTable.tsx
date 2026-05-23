"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */
interface Meta {
  platforms: string[];
  categories: string[];
  brands: string[];
  dates: string[]; // "YYYY-MM-DD"
}

interface MonthGroup {
  key: string; // "2026-05"
  label: string; // "MAY-26"
  days: string[]; // ["2026-05-15", ...]
}

interface RowCountData {
  counts: Record<string, number>; // date → count
}

interface OsaRemarkData {
  counts: Record<string, Record<string, number>>; // date → { remark → count }
}

type TableType = "row_count" | "osa_remark";

interface DimensionRow {
  dimension: "platform" | "category" | "brand";
  label: string;
  value?: string; // if set, it's a drilldown child
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
    const key = d.slice(0, 7); // "2026-05"
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
export default function AnalysisTable({ type, db }: { type: TableType; db: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);

  // Cache: key = "type|dimension|value" → data
  const [dataCache, setDataCache] = useState<
    Record<string, RowCountData | OsaRemarkData>
  >({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  // ── Fetch meta ──
  useEffect(() => {
    fetch(`/api/pdp-analysis?type=meta&db=${encodeURIComponent(db)}`)
      .then((r) => r.json())
      .then((data: Meta) => {
        setMeta(data);
        setMonthGroups(groupDatesByMonth(data.dates));
        // Expand first month by default for better initial visual layout
        if (data.dates.length > 0) {
          const firstMonth = data.dates[0].slice(0, 7);
          setExpandedMonths(new Set([firstMonth]));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch meta:", err);
        setLoading(false);
      });
  }, []);

  // ── Fetch data for a cache key ──
  const fetchData = useCallback(
    async (dimension: string, value?: string) => {
      const cacheKey = `${type}|${dimension}|${value || ""}`;
      if (dataCache[cacheKey] || loadingKeys.has(cacheKey)) return;

      setLoadingKeys((prev) => new Set(prev).add(cacheKey));

      let url = `/api/pdp-analysis?type=${type}&dimension=${dimension}&db=${encodeURIComponent(db)}`;
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
    [type, dataCache, loadingKeys]
  );

  // ── Fetch header-level data on mount ──
  useEffect(() => {
    if (!meta) return;
    fetchData("platform");
    fetchData("category");
    fetchData("brand");
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
        result.push({
          dimension: "platform",
          label: p,
          value: p,
          isHeader: false,
        });
      }
    }

    // Category
    result.push({ dimension: "category", label: "Category", isHeader: true });
    if (expandedDimensions.has("category")) {
      for (const c of meta.categories) {
        result.push({
          dimension: "category",
          label: c,
          value: c,
          isHeader: false,
        });
      }
    }

    // Brand
    result.push({ dimension: "brand", label: "Brand", isHeader: true });
    if (expandedDimensions.has("brand")) {
      for (const b of meta.brands) {
        result.push({
          dimension: "brand",
          label: b,
          value: b,
          isHeader: false,
        });
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
        // Fetch child data
        if (meta) {
          const values =
            dim === "platform"
              ? meta.platforms
              : dim === "category"
                ? meta.categories
                : meta.brands;
          for (const v of values) {
            fetchData(dim, v);
          }
        }
      }
      return next;
    });
  };

  // ── Get cell value ──
  const getCellValue = (
    row: DimensionRow,
    date: string
  ): string => {
    const cacheKey = `${type}|${row.dimension}|${row.value || ""}`;
    const cached = dataCache[cacheKey];
    if (!cached) return "...";

    if (type === "row_count") {
      const d = cached as RowCountData;
      return formatNumber(d.counts[date]);
    } else {
      const d = cached as OsaRemarkData;
      const byDate = d.counts[date];
      if (!byDate) return "—";
      return Object.entries(byDate)
        .map(([remark, cnt]) => `${remark}: ${formatNumber(cnt)}`)
        .join(" | ");
    }
  };

  // ── Get month aggregate ──
  const getMonthValue = (
    row: DimensionRow,
    days: string[]
  ): string => {
    const cacheKey = `${type}|${row.dimension}|${row.value || ""}`;
    const cached = dataCache[cacheKey];
    if (!cached) return "...";

    if (type === "row_count") {
      const d = cached as RowCountData;
      let total = 0;
      let hasAny = false;
      for (const day of days) {
        if (d.counts[day] !== undefined) {
          total += d.counts[day];
          hasAny = true;
        }
      }
      return hasAny ? formatNumber(total) : "—";
    } else {
      const d = cached as OsaRemarkData;
      const agg: Record<string, number> = {};
      for (const day of days) {
        if (d.counts[day]) {
          for (const [remark, cnt] of Object.entries(d.counts[day])) {
            agg[remark] = (agg[remark] || 0) + cnt;
          }
        }
      }
      if (Object.keys(agg).length === 0) return "—";
      return Object.entries(agg)
        .map(([remark, cnt]) => `${remark}: ${formatNumber(cnt)}`)
        .join(" | ");
    }
  };

  // ── Get OSA remark cell as structured data (for badge rendering) ──
  const getOsaCell = (
    row: DimensionRow,
    dates: string[]
  ): Record<string, number> | null => {
    const cacheKey = `${type}|${row.dimension}|${row.value || ""}`;
    const cached = dataCache[cacheKey] as OsaRemarkData | undefined;
    if (!cached) return null;

    const agg: Record<string, number> = {};
    for (const day of dates) {
      if (cached.counts[day]) {
        for (const [remark, cnt] of Object.entries(cached.counts[day])) {
          agg[remark] = (agg[remark] || 0) + cnt;
        }
      }
    }
    return Object.keys(agg).length > 0 ? agg : null;
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="table-loading">
        <div className="loading-spinner" />
        <span>Loading details...</span>
      </div>
    );
  }

  if (!meta) {
    return <div className="table-error">Failed to load metadata</div>;
  }

  const tableTitle =
    type === "row_count"
      ? "Row Count Analysis"
      : "OSA Remark Distribution";

  const tableSubtitle =
    type === "row_count"
      ? "Row count totals by Platform, Category, and Brand"
      : "OSA Remark counts (instock / oos / delisted) by dimension";

  return (
    <div className="analysis-table-wrapper">
      <div className="table-header-bar">
        <div className="header-badge-title">
          <span className="dot-indicator" />
          <h2 className="table-title">{tableTitle}</h2>
        </div>
        <p className="table-subtitle">{tableSubtitle}</p>
      </div>
      <div className="table-scroll-container">
        <table className="analysis-table">
          <thead>
            {/* Top Header Row: Dimension Name & Month Names */}
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
            {/* Bottom Header Row: Day Names / Total indicator */}
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
                      <span className="total-label-text">AVG / TOTAL</span>
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
                      style={{
                        paddingLeft: isChildRow ? "24px" : "8px",
                      }}
                    >
                      {row.isHeader && (
                        <span
                          className={`row-chevron ${isExpanded ? "rotated" : ""}`}
                        >
                          ▶
                        </span>
                      )}
                      {isChildRow && (
                        <span className="child-connector">└─</span>
                      )}
                      <span
                        className={
                          row.isHeader ? "dimension-name" : "child-name"
                        }
                      >
                        {row.label}
                      </span>
                    </div>
                  </td>

                  {/* Data cells */}
                  {monthGroups.map((mg) => {
                    const isMonthExpanded = expandedMonths.has(mg.key);

                    if (isMonthExpanded) {
                      return mg.days.map((day) => (
                        <td key={day} className="data-cell day-data-cell">
                          {type === "osa_remark" ? (
                            <OsaBadges
                              data={getOsaCell(row, [day])}
                              loading={
                                loadingKeys.has(
                                  `${type}|${row.dimension}|${row.value || ""}`
                                )
                              }
                            />
                          ) : (
                            <span className="count-value">
                              {getCellValue(row, day)}
                            </span>
                          )}
                        </td>
                      ));
                    } else {
                      return (
                        <td key={mg.key} className="data-cell month-data-cell">
                          {type === "osa_remark" ? (
                            <OsaBadges
                              data={getOsaCell(row, mg.days)}
                              loading={
                                loadingKeys.has(
                                  `${type}|${row.dimension}|${row.value || ""}`
                                )
                              }
                            />
                          ) : (
                            <span className="count-value month-total-val">
                              {getMonthValue(row, mg.days)}
                            </span>
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
   OSA Badges sub-component
   ═══════════════════════════════════════════ */
function OsaBadges({
  data,
  loading,
}: {
  data: Record<string, number> | null;
  loading: boolean;
}) {
  if (loading) return <span className="cell-loading">...</span>;
  if (!data) return <span className="cell-empty">—</span>;

  const remarkOrder = ["instock", "oos", "delisted"];

  return (
    <div className="osa-badges-grid">
      {remarkOrder.map((remark) => {
        const count = data[remark];
        if (count === undefined) return null;
        return (
          <div key={remark} className={`osa-badge-pill osa-pill-${remark}`}>
            <span className="osa-pill-indicator" />
            <span className="osa-pill-label">{remark}</span>
            <span className="osa-pill-count">{formatNumber(count)}</span>
          </div>
        );
      })}
    </div>
  );
}
