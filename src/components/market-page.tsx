"use client";

import { useQuery } from "@tanstack/react-query";
import { AddMarketModelForm } from "@/components/add-market-model-form";
import { ManageMarketModels } from "@/components/manage-market-models";
import { MarketChart } from "@/components/market-chart";
import { PageHeader } from "@/components/ui";
import type { MarketChartPayload } from "@/lib/market/chart-data";
import { fetchJson, queryKeys } from "@/lib/query-keys";

type MarketPayload = {
  data: MarketChartPayload;
  scrape: { status: string; message: string };
  models: {
    id: string;
    name: string;
    variant: string;
    hidden: boolean;
  }[];
};

export function MarketPageClient() {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.market,
    queryFn: () => fetchJson<MarketPayload>("/api/market"),
  });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        {error instanceof Error ? error.message : "Could not load market"}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Market"
        subtitle="FINN.no price vs km — scrape and filter listings"
      />
      {isPending && !data ? (
        <div className="h-96 animate-pulse rounded-xl bg-stone-200/60" />
      ) : data ? (
        <>
          <MarketChart data={data.data} initialStatus={data.scrape} />
          <div className="mt-4 space-y-4">
            <ManageMarketModels models={data.models} />
            <AddMarketModelForm />
          </div>
        </>
      ) : null}
    </div>
  );
}
