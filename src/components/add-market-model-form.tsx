"use client";

import { useActionState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addMarketModelAction,
  type AddMarketModelState,
} from "@/app/actions/market";
import { Button, Field, inputClass } from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";

export function AddMarketModelForm() {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    AddMarketModelState,
    FormData
  >(addMarketModelAction, null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.market });
      void queryClient.invalidateQueries({ queryKey: ["cars"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [state, queryClient]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-stone-900">Add scrape model</h2>
      <p className="mt-0.5 mb-3 text-xs text-stone-500">
        Paste a FINN variant ID or a search URL with{" "}
        <code className="text-stone-700">?variant=ÔÇª</code>. Registration class
        is detected automatically.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Variant or FINN URL">
          <input
            name="variant"
            required
            placeholder="2.813.2825.2000267 or https://www.finn.no/ÔÇª?variant=ÔÇª"
            className={inputClass}
            disabled={pending}
          />
        </Field>
        <Field label="Display name (optional)">
          <input
            name="name"
            placeholder="Auto from FINN if empty"
            className={inputClass}
            disabled={pending}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "AddingÔÇª" : "Add model"}
        </Button>
      </div>
      {state?.ok === false ? (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="mt-2 text-xs text-emerald-700">{state.message}</p>
      ) : null}
    </form>
  );
}
