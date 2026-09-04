import * as cheerio from "cheerio";
import { requireEnv, supabase } from "@/lib/supabase";
import { fetchPage, resolveRegistrationClass } from "./scrape";
import { DEFAULT_SEARCH_PARAMS, type SearchParams } from "./types";

const VARIANT_RE = /^\d+(?:\.\d+)+$/;

export function extractVariantFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (VARIANT_RE.test(trimmed)) return trimmed;
  if (trimmed.includes("variant=") || trimmed.includes("finn.no")) {
    try {
      const url = new URL(trimmed);
      const variant = url.searchParams.get("variant");
      if (variant && VARIANT_RE.test(variant)) return variant;
    } catch {
      // fall through
    }
    const m = trimmed.match(/[?&]variant=([^&\s]+)/i);
    if (m?.[1] && VARIANT_RE.test(decodeURIComponent(m[1]))) {
      return decodeURIComponent(m[1]);
    }
  }
  throw new Error(
    "Enter a FINN variant ID (e.g. 2.813.2825.2000267) or a search URL with ?variant=",
  );
}

export async function guessModelName(
  variant: string,
  params: SearchParams,
): Promise<string> {
  try {
    const html = await fetchPage(params, 1);
    const $ = cheerio.load(html);
    const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
    const name = h1.replace(/\s+biler p[aå] FINN.*$/i, "").trim();
    if (name) return name;
  } catch {
    // fall through
  }
  return `Variant ${variant}`;
}

export type UpsertMarketModelResult = {
  id: string;
  variant: string;
  name: string;
  created: boolean;
};

export async function upsertMarketModelFromInput(opts: {
  rawVariant: string;
  name?: string | null;
}): Promise<UpsertMarketModelResult> {
  requireEnv();
  const variant = extractVariantFromInput(opts.rawVariant);
  const params: SearchParams = {
    ...DEFAULT_SEARCH_PARAMS,
    variant,
    sales_form: "1",
    transmission: "2",
  };
  const registrationClass = await resolveRegistrationClass(variant, params);
  params.registration_class = registrationClass;

  const name = opts.name?.trim() || (await guessModelName(variant, params));

  const { data: existing, error: findErr } = await supabase
    .from("MarketModel")
    .select("*")
    .eq("variant", variant)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing) {
    const { data: updated, error } = await supabase
      .from("MarketModel")
      .update({
        name: opts.name?.trim() || existing.name,
        params,
        hidden: false,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: String(updated.id),
      variant: String(updated.variant),
      name: String(updated.name),
      created: false,
    };
  }

  const { data: created, error } = await supabase
    .from("MarketModel")
    .insert({
      variant,
      name,
      params,
      hidden: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: String(created.id),
    variant: String(created.variant),
    name: String(created.name),
    created: true,
  };
}
