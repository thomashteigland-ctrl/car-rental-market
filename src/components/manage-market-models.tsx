"use client";

import { useActionState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  renameMarketModelAction,
  setMarketModelHiddenAction,
  type RenameMarketModelState,
} from "@/app/actions/market";
import { Button, inputClass } from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";

export type ManageMarketModelRow = {
  id: string;
  name: string;
  variant: string;
  hidden: boolean;
};

async function invalidateMarket(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.market }),
    queryClient.invalidateQueries({ queryKey: ["cars"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  ]);
}

function RenameRow({ model }: { model: ManageMarketModelRow }) {
  const queryClient = useQueryClient();
  const [state, formAction, pending] = useActionState<
    RenameMarketModelState,
    FormData
  >(renameMarketModelAction, null);

  useEffect(() => {
    if (state?.ok) void invalidateMarket(queryClient);
  }, [state, queryClient]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={model.id} />
      <input
        name="name"
        defaultValue={model.name}
        required
        disabled={pending}
        className={`${inputClass} min-w-[10rem] flex-1`}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "ÔÇª" : "Save name"}
      </Button>
      {state?.ok === false ? (
        <span className="text-xs text-rose-700">{state.error}</span>
      ) : null}
      {state?.ok === true ? (
        <span className="text-xs text-emerald-700">{state.message}</span>
      ) : null}
    </form>
  );
}

export function ManageMarketModels({
  models,
}: {
  models: ManageMarketModelRow[];
}) {
  const queryClient = useQueryClient();
  const visible = models.filter((m) => !m.hidden);
  const hidden = models.filter((m) => m.hidden);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-stone-900">Manage models</h2>
      <p className="mt-0.5 mb-4 text-xs text-stone-500">
        Rename display names, or hide models you no longer scrape. Hidden models
        are left out of the graph and the scrape run.
      </p>

      <ul className="space-y-4">
        {visible.map((m) => (
          <li
            key={m.id}
            className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-3"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-stone-500">
                Variant{" "}
                <code className="text-stone-700">{m.variant}</code>
              </div>
              <form
                action={async (fd) => {
                  await setMarketModelHiddenAction(fd);
                  await invalidateMarket(queryClient);
                }}
              >
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="hidden" value="true" />
                <Button type="submit" variant="ghost" className="text-stone-600">
                  Hide
                </Button>
              </form>
            </div>
            <RenameRow model={m} />
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="text-sm text-stone-500">No visible models.</li>
        ) : null}
      </ul>

      {hidden.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Hidden
          </h3>
          <ul className="space-y-3">
            {hidden.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-stone-200 px-3 py-2 opacity-80"
              >
                <div>
                  <div className="text-sm text-stone-700">{m.name}</div>
                  <div className="text-xs text-stone-500">
                    <code>{m.variant}</code>
                  </div>
                </div>
                <form
                  action={async (fd) => {
                    await setMarketModelHiddenAction(fd);
                    await invalidateMarket(queryClient);
                  }}
                >
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="hidden" value="false" />
                  <Button type="submit" variant="secondary">
                    Unhide
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
