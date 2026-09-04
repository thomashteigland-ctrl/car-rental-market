import { NextResponse } from "next/server";
import { getScrapeStatus } from "@/lib/market/run-scrape";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getScrapeStatus();
  return NextResponse.json(status);
}
