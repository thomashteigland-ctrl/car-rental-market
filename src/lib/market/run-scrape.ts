import { requireEnv, supabase } from "@/lib/supabase";
import { mapPool, scrapeModel } from "./scrape";
import {
  MODEL_CONCURRENCY,
  type MarketModelConfig,
  type ParsedListing,
  type SearchParams,
} from "./types";

type DbListing = {
  id: string;
  year: number | null;
  km: number | null;
  priceNok: number | null;
  fuel: string | null;
  transmission: string | null;
  location: string | null;
  sellerType: string | null;
  title: string | null;
  status: string;
  scrapedDate: string;
  wltpKm: number | null;
  variant: string;
  updatedAt: string;
};

function todayDateIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

async function setJob(status: string, message: string, started = false) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: "current",
    status,
    message,
    updatedAt: now,
  };
  if (started) {
    payload.startedAt = now;
    payload.finishedAt = null;
  } else if (status !== "running") {
    payload.finishedAt = now;
  }
  const { error } = await supabase.from("ScrapeJob").upsert(payload);
  if (error) throw new Error(`ScrapeJob: ${error.message}`);
}

function asSearchParams(raw: unknown): SearchParams {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SearchParams = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v as string[];
    }
  }
  return out;
}

function listingFromParsed(fresh: ParsedListing, today: string): DbListing {
  return {
    id: fresh.id,
    year: fresh.year,
    km: fresh.km,
    priceNok: fresh.priceNok,
    fuel: fresh.fuel,
    transmission: fresh.transmission,
    location: fresh.location,
    sellerType: fresh.sellerType,
    title: fresh.title,
    status: fresh.status,
    scrapedDate: today,
    wltpKm: fresh.wltpKm,
    variant: fresh.variant,
    updatedAt: new Date().toISOString(),
  };
}

type ApplyStats = { created: number; updated: number; sold: number };

function isSoldStatus(status: string | null | undefined): boolean {
  return Boolean(status) && status !== "active";
}

async function applyListingsBatch(
  listings: ParsedListing[],
  byId: Map<string, DbListing>,
  today: string,
  opts?: { markMissingSoldForVariant?: string },
): Promise<ApplyStats> {
  const toCreate: Record<string, unknown>[] = [];
  const priceObs: Record<string, unknown>[] = [];
  const toDelete: string[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  let created = 0;
  let updated = 0;
  let sold = 0;
  const seenIds = new Set<string>();

  for (const fresh of listings) {
    const existing = byId.get(fresh.id);

    if (fresh.excludeCity) {
      if (existing) {
        toDelete.push(fresh.id);
        byId.delete(fresh.id);
        updated += 1;
      }
      continue;
    }

    seenIds.add(fresh.id);

    if (!existing) {
      toCreate.push({
        id: fresh.id,
        year: fresh.year,
        km: fresh.km,
        priceNok: fresh.priceNok,
        fuel: fresh.fuel,
        transmission: fresh.transmission,
        location: fresh.location,
        sellerType: fresh.sellerType,
        title: fresh.title,
        status: fresh.status,
        scrapedDate: today,
        wltpKm: fresh.wltpKm,
        variant: fresh.variant,
      });
      if (fresh.priceNok != null) {
        priceObs.push({
          listingId: fresh.id,
          observedDate: today,
          priceNok: fresh.priceNok,
          previousPriceNok: null,
          deltaNok: null,
          km: fresh.km,
          status: fresh.status,
          variant: fresh.variant,
          title: fresh.title,
        });
      }
      byId.set(fresh.id, listingFromParsed(fresh, today));
      created += 1;
      continue;
    }

    const oldPrice = existing.priceNok;
    const newPrice = fresh.priceNok;
    const priceChanged = newPrice != null && newPrice !== oldPrice;
    const data: Record<string, unknown> = {};
    if (fresh.year != null && fresh.year !== existing.year) data.year = fresh.year;
    if (fresh.title != null && fresh.title !== existing.title) data.title = fresh.title;
    if (fresh.fuel && fresh.fuel !== existing.fuel) data.fuel = fresh.fuel;
    if (fresh.transmission !== existing.transmission) {
      data.transmission = fresh.transmission;
    }
    if (fresh.km != null && fresh.km !== existing.km) data.km = fresh.km;
    if (fresh.wltpKm != null && fresh.wltpKm !== existing.wltpKm) {
      data.wltpKm = fresh.wltpKm;
    }
    const nextStatus =
      isSoldStatus(existing.status) && fresh.status === "active"
        ? fresh.priceNok != null
          ? "active"
          : existing.status
        : fresh.status;
    if (nextStatus !== existing.status) {
      data.status = nextStatus;
      if (isSoldStatus(nextStatus) && !isSoldStatus(existing.status)) sold += 1;
    }
    if (fresh.variant && fresh.variant !== existing.variant) {
      data.variant = fresh.variant;
    }
    if (priceChanged) data.priceNok = newPrice;

    if (Object.keys(data).length > 0) {
      data.updatedAt = new Date().toISOString();
      updates.push({ id: fresh.id, data });
      byId.set(fresh.id, {
        ...existing,
        year: fresh.year ?? existing.year,
        title: fresh.title ?? existing.title,
        fuel: fresh.fuel || existing.fuel,
        transmission:
          fresh.transmission !== existing.transmission
            ? fresh.transmission
            : existing.transmission,
        km: fresh.km ?? existing.km,
        wltpKm: fresh.wltpKm ?? existing.wltpKm,
        status: nextStatus,
        variant: fresh.variant || existing.variant,
        priceNok: priceChanged ? newPrice : existing.priceNok,
        updatedAt: String(data.updatedAt),
      });
      updated += 1;
    }

    if (priceChanged) {
      priceObs.push({
        listingId: fresh.id,
        observedDate: today,
        priceNok: newPrice!,
        previousPriceNok: oldPrice,
        deltaNok: oldPrice == null ? null : newPrice! - oldPrice,
        km: fresh.km ?? existing.km,
        status: nextStatus,
        variant: fresh.variant || existing.variant,
        title: fresh.title || existing.title,
      });
    }
  }

  const missingVariant = opts?.markMissingSoldForVariant;
  if (missingVariant) {
    for (const [id, row] of byId) {
      if (row.variant !== missingVariant) continue;
      if (isSoldStatus(row.status)) continue;
      if (seenIds.has(id)) continue;
      updates.push({
        id,
        data: { status: "sold", updatedAt: new Date().toISOString() },
      });
      byId.set(id, { ...row, status: "sold" });
      updated += 1;
      sold += 1;
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase.from("MarketListing").delete().in("id", toDelete);
    if (error) throw new Error(`Delete listings: ${error.message}`);
  }

  if (toCreate.length > 0) {
    const { error } = await supabase.from("MarketListing").upsert(toCreate, {
      onConflict: "id",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Create listings: ${error.message}`);
  }

  const CHUNK = 40;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    for (const { id, data } of slice) {
      const { error } = await supabase.from("MarketListing").update(data).eq("id", id);
      if (error) throw new Error(`Update listing ${id}: ${error.message}`);
    }
  }

  if (priceObs.length > 0) {
    const { error } = await supabase.from("MarketPriceObservation").insert(priceObs);
    if (error) throw new Error(`Price observations: ${error.message}`);
  }

  return { created, updated, sold };
}

export async function runMarketScrape(): Promise<{
  newCount: number;
  updatedCount: number;
  message: string;
}> {
  requireEnv();
  const { data: current, error: jobErr } = await supabase
    .from("ScrapeJob")
    .select("*")
    .eq("id", "current")
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (current?.status === "running") {
    throw new Error("Scrape already running");
  }

  await setJob("running", "Starting scrape…", true);

  try {
    const { data: models, error: modelErr } = await supabase
      .from("MarketModel")
      .select("*")
      .eq("hidden", false)
      .order("name");
    if (modelErr) throw new Error(modelErr.message);
    if (!models || models.length === 0) {
      throw new Error(
        "No visible market models. Add a model or unhide one on the Market page.",
      );
    }

    const { data: existing, error: listErr } = await supabase
      .from("MarketListing")
      .select("*");
    if (listErr) throw new Error(listErr.message);
    const byId = new Map((existing ?? []).map((r) => [r.id as string, r as DbListing]));
    const today = todayDateIso();

    let lastProgressAt = 0;
    const progress = async (msg: string) => {
      const now = Date.now();
      if (now - lastProgressAt < 1500) return;
      lastProgressAt = now;
      await setJob("running", msg);
    };

    await progress(
      `Scraping ${models.length} models (${MODEL_CONCURRENCY} at a time)…`,
    );

    const scraped = await mapPool(models, MODEL_CONCURRENCY, async (row) => {
      const model: MarketModelConfig = {
        variant: String(row.variant),
        name: String(row.name),
        params: asSearchParams(row.params),
      };
      return scrapeModel(model, progress);
    });

    await setJob("running", "Saving listings…");

    let newCount = 0;
    let updatedCount = 0;
    let soldCount = 0;
    for (const result of scraped) {
      const stats = await applyListingsBatch(result.listings, byId, today, {
        markMissingSoldForVariant: result.complete ? result.variant : undefined,
      });
      newCount += stats.created;
      updatedCount += stats.updated;
      soldCount += stats.sold;
    }

    const message =
      `Done — ${newCount} new, ${updatedCount} updated` +
      (soldCount ? `, ${soldCount} sold` : "");
    await setJob("done", message);
    return { newCount, updatedCount, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setJob("error", message);
    throw e;
  }
}

export async function getScrapeStatus() {
  requireEnv();
  const { data: job } = await supabase
    .from("ScrapeJob")
    .select("*")
    .eq("id", "current")
    .maybeSingle();
  return {
    status: (job?.status as string) ?? "idle",
    message: (job?.message as string) ?? "",
    startedAt: (job?.startedAt as string) ?? null,
    finishedAt: (job?.finishedAt as string) ?? null,
  };
}
