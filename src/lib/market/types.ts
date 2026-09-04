export type SearchParams = Record<string, string | string[]>;

export type MarketModelConfig = {
  variant: string;
  name: string;
  params: SearchParams;
};

export type ParsedListing = {
  id: string;
  year: number | null;
  km: number | null;
  priceNok: number | null;
  fuel: string;
  transmission: string | null;
  location: string | null;
  sellerType: string | null;
  title: string | null;
  status: string;
  wltpKm: number | null;
  variant: string;
  excludeCity: boolean;
};

export type PriceStats = {
  firstPrice: number | null;
  lastPrice: number | null;
  totalDelta: number | null;
  changeCount: number;
  dropped: boolean;
  raised: boolean;
};

export type ChartListing = {
  id: string;
  km: number;
  priceNok: number | null;
  plotPrice: number;
  title: string;
  year: number | null;
  status: string;
  fuel: string;
  fuelGroup: "ICE" | "BEV";
  wltpKm: number | null;
  wltpBucket: string;
  variant: string;
  modelName: string;
  scrapedDate: string;
  isNew: boolean;
  isSold: boolean;
  priceStats: PriceStats | null;
  priceLabel: string;
};

export type FitCurve = {
  name: string;
  x: number[];
  y: number[];
};

export const WLTP_BUCKETS = [
  { value: "all", label: "All WLTP" },
  { value: "unknown", label: "Unknown" },
  { value: "lt_280", label: "< 280 km" },
  { value: "280_319", label: "280ÔÇô319 km" },
  { value: "320_plus", label: "320+ km" },
] as const;

export const LISTING_URL = "https://www.finn.no/mobility/item/{id}";
export const BASE_URL = "https://www.finn.no/mobility/search/car";
export const MAX_PAGES = 15;
/** Pause between FINN page fetches within one model (keep polite, but don't crawl). */
export const REQUEST_DELAY_MS = 350;
/** How many models to scrape at once. */
export const MODEL_CONCURRENCY = 3;
export const MIN_FIT_ROWS = 8;

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  registration_class: "2",
  sales_form: "1",
  transmission: "2",
};
