import { NextRequest, NextResponse } from "next/server";

const CH_URL = process.env.CLICKHOUSE_URL || "http://13.203.251.97:8123";
const CH_USER = process.env.CLICKHOUSE_USER || "kenil_user";
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || "Kenil@Kavar0604";
const CH_DB_DEFAULT = process.env.CLICKHOUSE_DB || "boat";

async function queryClickHouse(sql: string, db?: string) {
  const database = db || CH_DB_DEFAULT;
  const url = `${CH_URL}/?user=${encodeURIComponent(CH_USER)}&password=${encodeURIComponent(CH_PASS)}&database=${encodeURIComponent(database)}`;
  const res = await fetch(url, {
    method: "POST",
    body: sql,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse error: ${text}`);
  }
  return res.text();
}

function parseTSV(raw: string): string[][] {
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => l.split("\t"));
}

// GET /api/pdp-analysis?type=databases|row_count|osa_remark|meta&db=boat
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "meta";
    const db = searchParams.get("db") || CH_DB_DEFAULT;

    // ── DATABASES: list all available databases ──
    if (type === "databases") {
      const raw = await queryClickHouse("SHOW DATABASES FORMAT TabSeparated", db);
      const databases = parseTSV(raw)
        .map((r) => r[0])
        .filter((name) => !["system", "information_schema", "INFORMATION_SCHEMA", "default"].includes(name))
        .sort();

      return NextResponse.json({ databases, current: db });
    }

    // ── META: return distinct dimension values + date range ──
    if (type === "meta") {
      const [platformsRaw, categoriesRaw, brandsRaw, locationsRaw, datesRaw] =
        await Promise.all([
          queryClickHouse(
            "SELECT DISTINCT platform_name FROM rb_pdp_week WHERE platform_name IS NOT NULL ORDER BY platform_name FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT brand_category_name FROM rb_pdp_week WHERE brand_category_name IS NOT NULL ORDER BY brand_category_name FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT brand_name FROM rb_pdp_week WHERE brand_name IS NOT NULL ORDER BY brand_name FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT location_name FROM rb_pdp_week WHERE location_name IS NOT NULL ORDER BY location_name FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT toDate(pdp_crawl_date) AS d FROM rb_pdp_week ORDER BY d FORMAT TabSeparated",
            db
          ),
        ]);

      return NextResponse.json({
        platforms: parseTSV(platformsRaw).map((r) => r[0]),
        categories: parseTSV(categoriesRaw).map((r) => r[0]),
        brands: parseTSV(brandsRaw).map((r) => r[0]),
        locations: parseTSV(locationsRaw).map((r) => r[0]),
        dates: parseTSV(datesRaw).map((r) => r[0]),
      });
    }

    // ── ROW COUNT ──
    if (type === "row_count") {
      const dimension = searchParams.get("dimension");
      const value = searchParams.get("value");

      let whereClause = "1=1";

      if (dimension === "platform" && value) {
        whereClause = `platform_name = '${value}'`;
      } else if (dimension === "category" && value) {
        whereClause = `brand_category_name = '${value}'`;
      } else if (dimension === "brand" && value) {
        whereClause = `brand_name = '${value}'`;
      } else if (dimension === "location" && value) {
        whereClause = `location_name = '${value}'`;
      }

      const sql = `SELECT toDate(pdp_crawl_date) AS date, count(*) AS cnt FROM rb_pdp_week WHERE ${whereClause} GROUP BY date ORDER BY date FORMAT TabSeparated`;
      const raw = await queryClickHouse(sql, db);
      const rows = parseTSV(raw);

      const counts: Record<string, number> = {};
      for (const [date, cnt] of rows) {
        counts[date] = parseInt(cnt, 10);
      }

      return NextResponse.json({ counts });
    }

    // ── OSA REMARK ──
    if (type === "osa_remark") {
      const dimension = searchParams.get("dimension");
      const value = searchParams.get("value");

      let whereClause = "1=1";

      if (dimension === "platform" && value) {
        whereClause = `platform_name = '${value}'`;
      } else if (dimension === "category" && value) {
        whereClause = `brand_category_name = '${value}'`;
      } else if (dimension === "brand" && value) {
        whereClause = `brand_name = '${value}'`;
      } else if (dimension === "location" && value) {
        whereClause = `location_name = '${value}'`;
      }

      const sql = `SELECT toDate(pdp_crawl_date) AS date, osa_remark, count(*) AS cnt FROM rb_pdp_week WHERE ${whereClause} AND osa_remark IS NOT NULL GROUP BY date, osa_remark ORDER BY date, osa_remark FORMAT TabSeparated`;
      const raw = await queryClickHouse(sql, db);
      const rows = parseTSV(raw);

      // Structure: { date: { remark: count } }
      const counts: Record<string, Record<string, number>> = {};
      for (const [date, remark, cnt] of rows) {
        if (!counts[date]) counts[date] = {};
        counts[date][remark] = parseInt(cnt, 10);
      }

      return NextResponse.json({ counts });
    }

    return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
