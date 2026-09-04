import { NextResponse } from "next/server";
import { loadMarketChartData } from "@/lib/market/chart-data";
import { getScrapeStatus } from "@/lib/market/run-scrape";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [data, scrape, modelsRes] = await Promise.all([
      loadMarketChartData(),
      getScrapeStatus(),
      supabase
        .from("MarketModel")
        .select("id,name,variant,hidden")
        .order("hidden")
        .order("name"),
    ]);
    if (modelsRes.error) throw new Error(modelsRes.error.message);

    return NextResponse.json({
      data,
      scrape: { status: scrape.status, message: scrape.message },
      models: modelsRes.data ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
