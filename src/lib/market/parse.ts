import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { ParsedListing } from "./types";

/** FINN card meta: "2024 ÔêÖ 21 000 km" (year may be glued to prior word after cheerio .text()). */
const YEAR_KM_RE =
  /((?:19|20)\d{2})\s*[ÔêÖ┬À]\s*([\d\s\u00a0]*\d[\d\s\u00a0]*)\s*km\b(?!\s*rekkevidde)/i;

/** Year before the bullet meta separator when odometer is missing: "2023 ÔêÖ El ÔêÖ ÔÇª". */
const YEAR_META_RE = /((?:19|20)\d{2})\s*[ÔêÖ┬À]/;

export function fuelGroupFor(fuel: string): "ICE" | "BEV" {
  const f = (fuel || "").toLowerCase();
  if (f === "electric" || f === "el" || f === "elektrisk" || f === "bev") {
    return "BEV";
  }
  return "ICE";
}

export function wltpBucket(wltpKm: number | null): string {
  if (wltpKm == null) return "unknown";
  if (wltpKm < 280) return "lt_280";
  if (wltpKm < 320) return "280_319";
  return "320_plus";
}

/** Cheerio's .text() glues adjacent blocks (WEBASTO2024); insert spaces like BeautifulSoup. */
function cardPlainText($: cheerio.CheerioAPI, card: AnyNode): string {
  const html = $(card).html();
  if (!html) return $(card).text().replace(/\s+/g, " ").trim();
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseYearAndKm(text: string): {
  year: number | null;
  km: number | null;
} {
  const yearKm = text.match(YEAR_KM_RE);
  if (yearKm) {
    return {
      year: Number(yearKm[1]),
      km: Number(yearKm[2].replace(/[\s\u00a0]/g, "")),
    };
  }

  const yearMeta = text.match(YEAR_META_RE);
  const year = yearMeta ? Number(yearMeta[1]) : null;
  return { year, km: parseKmFallback(text) };
}

export function parseKm(text: string): number | null {
  return parseYearAndKm(text).km;
}

function parseKmFallback(text: string): number | null {
  const re = /([\d\s\u00a0]*\d[\d\s\u00a0]*)\s*km\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 20);
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/^\s*rekkevidde/i.test(after)) continue;
    if (/WLTP/i.test(before) || /^\s*WLTP/i.test(after)) continue;
    const raw = m[1];
    const val = Number(raw.replace(/[\s\u00a0]/g, ""));
    if (!Number.isFinite(val)) continue;
    // Skip bare WLTP-sized numbers without thousand-separators.
    if (val >= 150 && val <= 450 && !/[\s\u00a0]/.test(raw)) continue;
    return val;
  }
  return null;
}

export function parsePrice(text: string): number | null {
  const m = text.match(/(\d[\d\s\u00a0]*)\s*kr/);
  if (!m) return null;
  return Number(m[1].replace(/[\s\u00a0]/g, ""));
}

export function parseWltp(text: string): number | null {
  const patterns = [
    /(\d{2,3})\s*km\s*rekkevidde/i,
    /(\d{2,3})\s*km\s*WLTP/i,
    /(\d{2,3})\s*WLTP/i,
    /WLTP\D{0,8}(\d{2,3})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

export function isProaceCity(text: string): boolean {
  return /Proace\s*City/i.test(text);
}

export function parseTransmission(text: string): string | null {
  if (/Automat/i.test(text)) return "Automat";
  if (/Manuell/i.test(text)) return "Manuell";
  return null;
}

/** FINN sold badge ÔÇö keep last known price when the card still shows kr. */
export function listingStatus(
  text: string,
  price: number | null,
): "active" | "sold" | "sold_no_price" {
  if (!/solgt/i.test(text)) return "active";
  return price == null ? "sold_no_price" : "sold";
}

export function countSearchHits(html: string): number | null {
  let m = html.match(/>\s*(\d[\d\s]*)<\s*\/\s*span>\s*treff/i);
  if (!m) {
    m = html.replace(/<[^>]+>/g, " ").match(/(\d[\d\s]*)\s*treff/i);
  }
  if (!m) return null;
  const digits = m[1].replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function parseListings(html: string, variant: string): ParsedListing[] {
  const $ = cheerio.load(html);
  const itemLinkRe = /\/mobility\/item\/(\d+)/;
  const listings: ParsedListing[] = [];

  const articleCards = $("article");
  const cards =
    articleCards.length > 0
      ? articleCards
      : $("*").filter(
          (_, el) => $(el).find(`a[href*="/mobility/item/"]`).length > 0,
        );

  const seen = new Set<string>();
  cards.each((_, card) => {
    const $card = $(card);
    const link = $card.find(`a[href*="/mobility/item/"]`).first();
    const href = link.attr("href") || "";
    const match = href.match(itemLinkRe);
    if (!match) return;
    const adId = match[1];
    if (seen.has(adId)) return;
    seen.add(adId);

    const text = cardPlainText($, card);
    if (isProaceCity(text)) {
      listings.push({
        id: adId,
        year: null,
        km: null,
        priceNok: null,
        fuel: "Unknown",
        transmission: null,
        location: null,
        sellerType: null,
        title: null,
        status: "active",
        wltpKm: null,
        variant,
        excludeCity: true,
      });
      return;
    }

    const title = link.text().trim() || null;
    const { year, km } = parseYearAndKm(text);
    const price = parsePrice(text);
    const wltp = parseWltp(text);
    const status = listingStatus(text, price);

    let fuel = "Unknown";
    if (/\bEl\b|Elektrisk/i.test(text)) fuel = "Electric";
    else if (/\bDiesel\b/i.test(text)) fuel = "Diesel";
    else if (/\bBensin\b/i.test(text)) fuel = "Bensin";
    else if (/Hybrid/i.test(text)) fuel = "Hybrid";

    listings.push({
      id: adId,
      year,
      km,
      priceNok: price,
      fuel,
      transmission: parseTransmission(text),
      location: null,
      sellerType: null,
      title,
      status,
      wltpKm: fuel === "Electric" ? wltp : null,
      variant,
      excludeCity: false,
    });
  });

  return listings;
}
