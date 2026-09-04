"use server";

import { revalidatePath } from "next/cache";
import { upsertMarketModelFromInput } from "@/lib/market/add-model";
import { supabase } from "@/lib/supabase";

function revalidateMarket() {
  revalidatePath("/");
}

export type AddMarketModelState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function addMarketModelAction(
  _prev: AddMarketModelState,
  formData: FormData,
): Promise<AddMarketModelState> {
  const rawVariant = String(formData.get("variant") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;

  if (!rawVariant.trim()) {
    return { ok: false, error: "Variant ID or FINN URL is required" };
  }

  try {
    const result = await upsertMarketModelFromInput({
      rawVariant,
      name,
    });
    revalidateMarket();
    return {
      ok: true,
      message: result.created
        ? `Added ${result.name} — run scrape to pull listings`
        : `Updated ${result.name}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not add model",
    };
  }
}

export type RenameMarketModelState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function renameMarketModelAction(
  _prev: RenameMarketModelState,
  formData: FormData,
): Promise<RenameMarketModelState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { ok: false, error: "Missing model id" };
  if (!name) return { ok: false, error: "Name is required" };

  try {
    const { data: updated, error } = await supabase
      .from("MarketModel")
      .update({ name, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .select("name")
      .single();
    if (error) throw error;
    revalidateMarket();
    return { ok: true, message: `Renamed to ${updated.name}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not rename",
    };
  }
}

export async function setMarketModelHiddenAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const hidden = String(formData.get("hidden") ?? "") === "true";
  if (!id) throw new Error("Missing model id");

  const { error } = await supabase
    .from("MarketModel")
    .update({ hidden, updatedAt: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateMarket();
}
