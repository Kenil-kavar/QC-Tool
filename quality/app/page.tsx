"use client";

import { useEffect, useState } from "react";
import AnalysisTable from "./components/AnalysisTable";
import KwAnalysisTable from "./components/KwAnalysisTable";

export default function Home() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [loadingDbs, setLoadingDbs] = useState(true);

  // Fetch available databases on mount
  useEffect(() => {
    fetch("/api/pdp-analysis?type=databases")
      .then((r) => r.json())
      .then((data) => {
        setDatabases(data.databases || []);
        setSelectedDb(data.current || "");
        setLoadingDbs(false);
      })
      .catch((err) => {
        console.error("Failed to fetch databases:", err);
        setLoadingDbs(false);
      });
  }, []);

  const handleDbChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDb(e.target.value);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">PDP & Keyword Week Analysis</h1>
          <p className="page-description">
            Comprehensive analysis of the <strong>rb_pdp_week</strong> and <strong>rb_kw_week</strong> tables —
            aggregating row counts, OSA remark distributions, and keyword search ranks (Count, Min & Max Rank) by dimension with drilldowns.
          </p>
        </div>

        <div className="db-selector-card">
          <div className="db-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <div className="db-select-section">
            <label htmlFor="db-select" className="db-label">Database</label>
            {loadingDbs ? (
              <div className="db-loading">
                <span className="db-loading-dot" />
                Loading databases...
              </div>
            ) : (
              <div className="db-select-container">
                <select
                  id="db-select"
                  className="db-select"
                  value={selectedDb}
                  onChange={handleDbChange}
                >
                  {databases.map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedDb && (
        <div className="tables-container" key={selectedDb}>
          <AnalysisTable type="row_count" db={selectedDb} />
          <AnalysisTable type="osa_remark" db={selectedDb} />
          <KwAnalysisTable db={selectedDb} />
        </div>
      )}
    </div>
  );
}
