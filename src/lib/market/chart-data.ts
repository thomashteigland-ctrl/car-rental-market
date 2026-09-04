import { requireEnv, supabase } from "@/lib/supabase";
import { bestCurve, fitModels, modelPriceAt, type FitResult } from "./fit";
import { fuelGroupFor, wltpBucket } from "./parse";
import type { ChartListing, FitCurve, PriceStats } from "./types";

function isoDate(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return isoDate(new Date());
}

function priceStatsFromHistory(
  rows: { priceNok: number | null; previousPriceNok: number | null }[],
): PriceStats | null {
  const priced = rows.filter((r) => r.priceNok != null);
  if (priced.length === 0) return null;
  const first = priced[0].priceNok;
  const last = priced[priced.length - 1].priceNok;
  const changes = priced.filter(
    (r) =>
      r.previousPriceNok != null &&
      r.priceNok != null &&
      r.priceNok !== r.previousPriceNok,
  );
  const totalDelta = first == null || last == null ? null : last - first;
  return {
    firstPrice: first,
    lastPrice: last,
    totalDelta,
    changeCount: changes.length,
    dropped: totalDelta != null && totalDelta < 0,
    raised: totalDelta != null && totalDelta > 0,
  };
}

export async function loadMarketChartData() {
  requireEnv();
  const [{ data: models, error: mErr }, { data: listings, error: lErr }, { data: history, error: hErr }] =
    await Promise.all([
      supabase.from("MarketModel").select("*").eq("hidden", false).order("name"),
      supabase.from("MarketListing").select("*"),
      supabase.from("MarketPriceObservation").select("*").order("observedDate"),
    ]);
  if (mErr) throw new Error(mErr.message);
  if (lErr) throw new Error(lErr.message);
  if (hErr) throw new Error(hErr.message);

  const historyByListing = new Map<
    string,
    { priceNok: number | null; previousPriceNok: number | null }[]
  >();
  for (const row of history ?? []) {
    const id = String(row.listingId);
    const bucket = historyByListing.get(id) ?? [];
    bucket.push({
      priceNok: (row.priceNok as number | null) ?? null,
      previousPriceNok: (row.previousPriceNok as number | null) ?? null,
    });
    historyByListing.set(id, bucket);
  }

  const modelRows = models ?? [];
  const labels = Object.fromEntries(
    modelRows.map((m) => [String(m.variant), String(m.name)]),
  );
  const visibleVariants = new Set(modelRows.map((m) => String(m.variant)));
  const today = todayIso();

  const activeRaw: ChartListing[] = [];
  const soldRaw: {
    listing: ChartListing;
    fuelGroup: "ICE" | "BEV";
    variant: string;
    km: number;
  }[] = [];

  for (const row of listings ?? []) {
    if (row.km == null) continue;
    const variant = String(row.variant);
    if (!visibleVariants.has(variant)) continue;
    const fuelGroup = fuelGroupFor(String(row.fuel || "Diesel"));
    const stats = priceStatsFromHistory(historyByListing.get(String(row.id)) ?? []);
    const isSold = Boolean(row.status && row.status !== "active");
    const scrapedDate = isoDate(row.scrapedDate as string);
    const base = {
      id: String(row.id),
      km: Number(row.km),
      priceNok: (row.priceNok as number | null) ?? null,
      title: String(row.title || ""),
      year: (row.year as number | null) ?? null,
      status: String(row.status),
      fuel: String(row.fuel || "Unknown"),
      fuelGroup,
      wltpKm: (row.wltpKm as number | null) ?? null,
      wltpBucket: wltpBucket((row.wltpKm as number | null) ?? null),
      variant,
      modelName: labels[variant] || variant || "Unknown",
      scrapedDate,
      isNew: scrapedDate === today && !isSold,
      isSold,
      priceStats: stats,
    };

    if (isSold) {
      soldRaw.push({
        listing: {
          ...base,
          plotPrice: (row.priceNok as number | null) ?? 0,
          priceLabel:
            row.priceNok != null
              ? `${Number(row.priceNok).toLocaleString("nb-NO")} kr`
              : "Sold (no listed price)",
        },
        fuelGroup,
        variant,
        km: Number(row.km),
      });
    } else if (row.priceNok != null) {
      activeRaw.push({
        ...base,
        plotPrice: Number(row.priceNok),
        priceLabel: `${Number(row.priceNok).toLocaleString("nb-NO")} kr`,
      });
    }
  }

  const fitsByScope: Record<string, FitResult> = {};
  const scopes: { key: string; rows: ChartListing[] }[] = [
    { key: "all|ICE", rows: activeRaw.filter((r) => r.fuelGroup === "ICE") },
    { key: "all|BEV", rows: activeRaw.filter((r) => r.fuelGroup === "BEV") },
  ];
  for (const m of modelRows) {
    const variant = String(m.variant);
    scopes.push({
      key: `${variant}|ICE`,
      rows: activeRaw.filter((r) => r.variant === variant && r.fuelGroup === "ICE"),
    });
    scopes.push({
      key: `${variant}|BEV`,
      rows: activeRaw.filter((r) => r.variant === variant && r.fuelGroup === "BEV"),
    });
  }

  for (const scope of scopes) {
    const fit = fitModels(
      scope.rows.map((r) => r.km),
      scope.rows.map((r) => r.priceNok!),
    );
    if (fit) fitsByScope[scope.key] = fit;
  }

  const sold: ChartListing[] = [];
  for (const s of soldRaw) {
    if (s.listing.priceNok != null) {
      sold.push(s.listing);
      continue;
    }
    const fit =
      fitsByScope[`${s.variant}|${s.fuelGroup}`] ||
      fitsByScope[`all|${s.fuelGroup}`];
    if (!fit) continue;
    sold.push({
      ...s.listing,
      plotPrice: modelPriceAt(s.km, fit),
      priceLabel: "Sold (no listed price)",
    });
  }

  const fitCurves: Record<string, FitCurve> = {};
  for (const [key, fit] of Object.entries(fitsByScope)) {
    fitCurves[key] = bestCurve(fit);
  }

  const years = [
    ...new Set(
      [...activeRaw, ...sold]
        .map((r) => r.year)
        .filter((y): y is number => y != null),
    ),
  ].sort((a, b) => b - a);

  return {
    models: [
      { id: "all", name: "All models" },
      ...modelRows.map((m) => ({ id: String(m.variant), name: String(m.name) })),
    ],
    active: activeRaw,
    sold,
    fitCurves,
    years,
  };
}

export type MarketChartPayload = Awaited<ReturnType<typeof loadMarketChartData>>;
