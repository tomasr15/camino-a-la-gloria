import { buildFallbackNarrative, parseNarrativeContext, type NarrativeContext } from "../narrative.ts";
import type { Narrative } from "../contracts.ts";
import { NarrativeError, validateGeminiNarrative } from "./gemini.ts";

export interface SavedNarrative { narrative: Narrative; source: "gemini" | "fallback"; reason: string | null }
export interface NarrativeStore {
  reserve(fallback: SavedNarrative, enabled: boolean): Promise<{ entry: SavedNarrative; ticket: string | null }>;
  finish(ticket: string, entry: SavedNarrative, tokens: number | null): Promise<void>;
}
export async function generateNarrative(input: NarrativeContext, store: NarrativeStore,
  provider?: (context: NarrativeContext) => Promise<{ value: unknown; tokens: number | null }>,
): Promise<SavedNarrative> {
  const context = parseNarrativeContext(input);
  const fallback: SavedNarrative = { narrative: buildFallbackNarrative(context), source: "fallback", reason: "not_configured" };
  let reservation;
  try { reservation = await store.reserve(fallback, Boolean(provider)); }
  catch { return { ...fallback, reason: "storage_unavailable" }; } // Fail closed: never call Gemini without a durable reservation.
  if (!reservation.ticket || !provider) return reservation.entry;
  let entry: SavedNarrative; let tokens: number | null = null;
  try {
    const result = await provider(context); tokens = result.tokens;
    entry = { narrative: validateGeminiNarrative(result.value, context), source: "gemini", reason: null };
  } catch (error) {
    entry = { ...fallback, reason: error instanceof NarrativeError ? error.message : "provider_error" };
  }
  try { await store.finish(reservation.ticket, entry, tokens); }
  catch { return { ...reservation.entry, reason: "storage_unavailable" }; }
  return entry;
}
