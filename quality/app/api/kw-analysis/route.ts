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

// GET /api/kw-analysis?type=meta|data&db=boat&dimension=platform&value=amazon
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "meta";
    const db = searchParams.get("db") || CH_DB_DEFAULT;

    // ── META: return distinct dimension values + date range ──
    if (type === "meta") {
      const [platformsRaw, keywordsRaw, pincodesRaw, locationsRaw, datesRaw] =
        await Promise.all([
          queryClickHouse(
            "SELECT DISTINCT platform_name FROM rb_kw_week WHERE platform_name IS NOT NULL ORDER BY platform_name FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT keyword FROM rb_kw_week WHERE keyword IS NOT NULL ORDER BY keyword FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT toString(pincode) FROM rb_kw_week WHERE pincode IS NOT NULL ORDER BY pincode FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT location_name FROM rb_kw_week WHERE location_name IS NOT NULL ORDER BY location_name FORMAT TabSeparated",
            db
          ),
          queryClickHouse(
            "SELECT DISTINCT toDate(created_on) AS d FROM rb_kw_week ORDER BY d FORMAT TabSeparated",
            db
          ),
        ]);

      return NextResponse.json({
        platforms: parseTSV(platformsRaw).map((r) => r[0]),
        keywords: parseTSV(keywordsRaw).map((r) => r[0]),
        pincodes: parseTSV(pincodesRaw).map((r) => r[0]),
        locations: parseTSV(locationsRaw).map((r) => r[0]),
        dates: parseTSV(datesRaw).map((r) => r[0]),
      });
    }

    // ── DATA: aggregated metrics per date ──
    // Returns: { date: { count, max_rank, min_rank } }
    if (type === "data") {
      const dimension = searchParams.get("dimension"); // platform | keyword | pincode | location
      const value = searchParams.get("value"); // optional specific value

      let whereClause = "1=1";

      if (dimension === "platform" && value) {
        whereClause = `platform_name = '${value}'`;
      } else if (dimension === "keyword" && value) {
        whereClause = `keyword = '${value}'`;
      } else if (dimension === "pincode" && value) {
        whereClause = `toString(pincode) = '${value}'`;
      } else if (dimension === "location" && value) {
        whereClause = `location_name = '${value}'`;
      }

      const sql = `
        SELECT
          toDate(created_on) AS date,
          count(*) AS cnt,
          max(keyword_search_rank) AS max_rank,
          min(keyword_search_rank) AS min_rank
        FROM rb_kw_week
        WHERE ${whereClause}
        GROUP BY date
        ORDER BY date
        FORMAT TabSeparated
      `;

      const raw = await queryClickHouse(sql, db);
      const rows = parseTSV(raw);

      const metrics: Record<string, { count: number; max_rank: number; min_rank: number }> = {};
      for (const [date, cnt, maxR, minR] of rows) {
        metrics[date] = {
          count: parseInt(cnt, 10),
          max_rank: parseInt(maxR, 10),
          min_rank: parseInt(minR, 10),
        };
      }

      return NextResponse.json({ metrics });
    }

    return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("KW API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
