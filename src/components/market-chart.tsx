"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Data } from "plotly.js";
import type { MarketChartPayload } from "@/lib/market/chart-data";
import { LISTING_URL, WLTP_BUCKETS } from "@/lib/market/types";
import type { ChartListing } from "@/lib/market/types";
import { queryKeys } from "@/lib/query-keys";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const ICE = "#333333";
const BEV = "#1f77b4";
const SOLD = "#d62728";
const NEW = "#f5c542";

type Props = {
  data: MarketChartPayload;
  initialStatus: { status: string; message: string };
};

/** "all" = every model; otherwise the selected variant ids. */
type ModelSelection = "all" | string[];

function hoverText(p: ChartListing): string {
  const parts = [
    p.title || p.id,
    p.priceLabel,
    `${p.km.toLocaleString("nb-NO")} km`,
    p.year != null ? String(p.year) : "",
    p.fuelGroup,
    p.modelName,
  ];
  if (p.priceStats?.totalDelta != null && p.priceStats.changeCount > 0) {
    const d = p.priceStats.totalDelta;
    parts.push(
      `Price ╬ö ${d > 0 ? "+" : ""}${d.toLocaleString("nb-NO")} kr (${p.priceStats.changeCount} changes)`,
    );
  }
  return parts.filter(Boolean).join("<br>");
}

export function MarketChart({ data, initialStatus }: Props) {
  const queryClient = useQueryClient();
  const modelOptions = useMemo(
    () => data.models.filter((m) => m.id !== "all"),
    [data.models],
  );
  const [modelSelection, setModelSelection] = useState<ModelSelection>("all");
  const [fuel, setFuel] = useState("all");
  const [status, setStatus] = useState("all");
  const [wltp, setWltp] = useState("all");
  const [noOlderThan, setNoOlderThan] = useState("all");
  const [noNewerThan, setNoNewerThan] = useState("all");
  const [scrapeStatus, setScrapeStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  const selectedVariants = useMemo(() => {
    if (modelSelection === "all") {
      return new Set(modelOptions.map((m) => m.id));
    }
    const known = new Set(modelOptions.map((m) => m.id));
    return new Set(modelSelection.filter((id) => known.has(id)));
  }, [modelSelection, modelOptions]);

  const allSelected =
    modelSelection === "all" ||
    (modelOptions.length > 0 &&
      modelOptions.every((m) => selectedVariants.has(m.id)));

  function toggleModel(id: string) {
    setModelSelection((prev) => {
      const current =
        prev === "all" ? modelOptions.map((m) => m.id) : [...prev];
      const next = current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id];
      if (
        next.length === modelOptions.length &&
        modelOptions.every((m) => next.includes(m.id))
      ) {
        return "all";
      }
      return next;
    });
  }

  function toggleAll() {
    setModelSelection(allSelected ? [] : "all");
  }

  const filtered = useMemo(() => {
    const yearOk = (p: ChartListing) => {
      if (p.year == null) return noOlderThan === "all" && noNewerThan === "all";
      if (noOlderThan !== "all" && !(p.year >= Number(noOlderThan))) return false;
      if (noNewerThan !== "all" && !(p.year <= Number(noNewerThan))) return false;
      return true;
    };
    const modelOk = (p: ChartListing) => selectedVariants.has(p.variant);
    const wltpOk = (p: ChartListing) => {
      if (wltp === "all" || p.fuelGroup !== "BEV") return true;
      return p.wltpBucket === wltp;
    };
    const statusOk = (p: ChartListing, kind: "active" | "new" | "sold") => {
      if (status === "all") return true;
      if (status === "active") return kind === "active" || kind === "new";
      if (status === "new") return kind === "new";
      if (status === "sold") return kind === "sold";
      if (status === "price_dropped") {
        return Boolean(p.priceStats?.dropped);
      }
      if (status === "price_changed") {
        return Boolean(p.priceStats && p.priceStats.changeCount > 0);
      }
      return true;
    };

    const active = data.active.filter(
      (p) =>
        modelOk(p) &&
        yearOk(p) &&
        wltpOk(p) &&
        (fuel === "all" || p.fuelGroup === fuel) &&
        statusOk(p, p.isNew ? "new" : "active"),
    );
    const sold = data.sold.filter(
      (p) =>
        modelOk(p) &&
        yearOk(p) &&
        wltpOk(p) &&
        (fuel === "all" || p.fuelGroup === fuel) &&
        statusOk(p, "sold"),
    );
    return { active, sold };
  }, [data, selectedVariants, fuel, status, wltp, noOlderThan, noNewerThan]);

  const plotData = useMemo(() => {
    const ice = filtered.active.filter((p) => p.fuelGroup === "ICE" && !p.isNew);
    const bev = filtered.active.filter((p) => p.fuelGroup === "BEV" && !p.isNew);
    const neu = filtered.active.filter((p) => p.isNew);
    const traces: Data[] = [];

    const scatter = (
      pts: ChartListing[],
      name: string,
      color: string,
      symbol?: string,
    ): Data => ({
      type: "scatter",
      mode: "markers",
      name,
      x: pts.map((p) => p.km),
      y: pts.map((p) => p.plotPrice),
      text: pts.map(hoverText),
      hoverinfo: "text",
      customdata: pts.map((p) => p.id),
      marker: {
        color,
        size: symbol === "x" ? 10 : 8,
        symbol: symbol || "circle",
        line: color === NEW ? { color: "#b8860b", width: 1 } : undefined,
      },
    });

    if (ice.length) traces.push(scatter(ice, "ICE active", ICE));
    if (bev.length) traces.push(scatter(bev, "BEV active", BEV));
    if (neu.length) traces.push(scatter(neu, "New (today)", NEW));
    if (filtered.sold.length) {
      traces.push(scatter(filtered.sold, "Sold", SOLD, "x"));
    }

    const selected = [...selectedVariants];
    const fitKeys = allSelected
      ? (["all|ICE", "all|BEV"] as string[])
      : selected.flatMap((v) => [`${v}|ICE`, `${v}|BEV`]);

    const modelName = (variant: string) =>
      modelOptions.find((m) => m.id === variant)?.name ?? variant;

    for (const key of fitKeys) {
      const curve = data.fitCurves[key];
      if (!curve) continue;
      const group = key.endsWith("ICE") ? "ICE" : "BEV";
      if (fuel !== "all" && fuel !== group) continue;
      const variant = key.split("|")[0];
      const labelPrefix =
        variant === "all" ? group : `${modelName(variant)} ${group}`;
      traces.push({
        type: "scatter",
        mode: "lines",
        name: `${labelPrefix} fit (${curve.name})`,
        x: curve.x,
        y: curve.y,
        line: {
          color: group === "ICE" ? ICE : BEV,
          dash: group === "BEV" ? "dash" : "solid",
          width: 2,
        },
        hoverinfo: "skip",
      });
    }

    return traces;
  }, [filtered, data.fitCurves, selectedVariants, allSelected, fuel, modelOptions]);

  async function runScrape() {
    setScrapeStatus({ status: "running", message: "Starting scrapeÔÇª" });
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScrapeStatus({
          status: "error",
          message: body.error || `HTTP ${res.status}`,
        });
        return;
      }
      setScrapeStatus({ status: "done", message: body.message || "Done" });
      startTransition(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.market });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["cars"] });
      });
    } catch (e) {
      setScrapeStatus({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const yearOptions = data.years;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">
            Models (multi-select)
          </span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={toggleAll}
              className={`rounded-md px-2.5 py-1.5 text-sm ${
                allSelected
                  ? "bg-teal-800 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
              }`}
            >
              All models
            </button>
            {modelOptions.map((m) => {
              const on = selectedVariants.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleModel(m.id)}
                  aria-pressed={on}
                  className={`rounded-md px-2.5 py-1.5 text-sm ${
                    on
                      ? "bg-teal-800 text-white"
                      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={runScrape}
          disabled={scrapeStatus.status === "running" || pending}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {scrapeStatus.status === "running" ? "ScrapingÔÇª" : "Run scrape"}
        </button>
        <span className="text-xs text-stone-500">{scrapeStatus.message}</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-stone-500">Fuel</span>
          <select
            value={fuel}
            onChange={(e) => {
              setFuel(e.target.value);
              if (e.target.value === "ICE") setWltp("all");
            }}
            className="rounded-md border border-stone-200 bg-white px-2 py-1.5"
          >
            <option value="all">All</option>
            <option value="ICE">ICE</option>
            <option value="BEV">BEV</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-stone-500">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-stone-200 bg-white px-2 py-1.5"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="new">New today</option>
            <option value="sold">Sold</option>
            <option value="price_dropped">Price dropped</option>
            <option value="price_changed">Price changed</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-stone-500">WLTP</span>
          <select
            value={wltp}
            disabled={fuel === "ICE"}
            onChange={(e) => setWltp(e.target.value)}
            className="rounded-md border border-stone-200 bg-white px-2 py-1.5 disabled:opacity-50"
          >
            {WLTP_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-stone-500">No older than</span>
          <select
            value={noOlderThan}
            onChange={(e) => setNoOlderThan(e.target.value)}
            className="rounded-md border border-stone-200 bg-white px-2 py-1.5"
          >
            <option value="all">Any year</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-stone-500">No newer than</span>
          <select
            value={noNewerThan}
            onChange={(e) => setNoNewerThan(e.target.value)}
            className="rounded-md border border-stone-200 bg-white px-2 py-1.5"
          >
            <option value="all">Any year</option>
            {yearOptions.map((y) => (
              <option key={`n-${y}`} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-1.5 text-xs text-stone-400">
          Click a point to open the finn.no ad
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white p-2 shadow-sm">
        <Plot
          data={plotData}
          layout={{
            autosize: true,
            height: 560,
            margin: { l: 60, r: 20, t: 30, b: 50 },
            xaxis: { title: { text: "Kilometers" }, zeroline: false },
            yaxis: { title: { text: "Price (NOK)" }, rangemode: "tozero" },
            legend: { orientation: "h", y: 1.12 },
            paper_bgcolor: "transparent",
            plot_bgcolor: "#fafaf9",
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%" }}
          onClick={(ev) => {
            const id = ev.points?.[0]?.customdata;
            if (typeof id === "string") {
              window.open(LISTING_URL.replace("{id}", id), "_blank");
            }
          }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
