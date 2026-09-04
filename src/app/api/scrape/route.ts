import { NextResponse } from "next/server";
import { runMarketScrape } from "@/lib/market/run-scrape";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runMarketScrape();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("already running") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
