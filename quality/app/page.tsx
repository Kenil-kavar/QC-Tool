import AnalysisTable from "./components/AnalysisTable";

export default function Home() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">PDP Week Analysis</h1>
        <p className="page-description">
          Comprehensive analysis of the <strong>rb_pdp_week</strong> table —
          row counts and OSA remark distributions by Platform, Category, and
          Brand with month → day drilldown.
        </p>
      </div>

      <div className="tables-container">
        <AnalysisTable type="row_count" />
        <AnalysisTable type="osa_remark" />
      </div>
    </div>
  );
}
