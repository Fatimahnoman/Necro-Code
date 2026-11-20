/**
 * BYOK sigils: provider metadata plus the header contract shared by the
 * client hook and the SSE route. Keys never enter the request body.
 */

export type ApiSigilProvider = "gemini" | "groq" | "openrouter";

export interface ApiSigils {
  gemini: string;
  groq: string;
  openrouter: string;
}

export const EMPTY_API_SIGILS: ApiSigils = {
  gemini: "",
  groq: "",
  openrouter: "",
};

export const API_SIGILS_STORAGE_KEY = "necrocode.api-sigils.v1";

export const API_SIGIL_HEADERS: Record<ApiSigilProvider, string> = {
  gemini: "x-necro-gemini-key",
  groq: "x-necro-groq-key",
  openrouter: "x-necro-openrouter-key",
};

export interface ApiSigilMeta {
  id: ApiSigilProvider;
  label: string;
  model: string;
  placeholder: string;
  hint: string;
}

/** Fallback order is deliberate: Gemini → Groq → OpenRouter → builtin. */
export const API_SIGIL_META: ApiSigilMeta[] = [
  {
    id: "gemini",
    label: "Gemini",
    model: "gemini-2.5-flash",
    placeholder: "AIza…",
    hint: "Google AI Studio key",
  },
  {
    id: "groq",
    label: "Groq / Grok",
    model: "llama-3.3-70b-versatile",
    placeholder: "gsk_…",
    hint: "Groq API key",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    model: "openrouter/auto",
    placeholder: "sk-or-v1-…",
    hint: "OpenRouter key",
  },
];

export function normalizeApiSigils(input: Partial<ApiSigils>): ApiSigils {
  const clean = (value: unknown): string =>
    typeof value === "string" ? value.trim().slice(0, 600) : "";

  return {
    gemini: clean(input.gemini),
    groq: clean(input.groq),
    openrouter: clean(input.openrouter),
  };
}

export function hasLiveSigils(sigils: Partial<ApiSigils>): boolean {
  return API_SIGIL_META.some(
    (provider) => (sigils[provider.id] ?? "").trim().length > 0,
  );
}

export function sigilsToHeaders(
  sigils: Partial<ApiSigils> | null | undefined,
): Record<string, string> {
  if (!sigils) return {};
  const headers: Record<string, string> = {};

  for (const provider of API_SIGIL_META) {
    const key = (sigils[provider.id] ?? "").trim();
    if (key.length > 0) headers[API_SIGIL_HEADERS[provider.id]] = key;
  }

  return headers;
}

export function sigilsFromHeaders(headers: Headers): ApiSigils {
  return normalizeApiSigils({
    gemini: headers.get(API_SIGIL_HEADERS.gemini) ?? "",
    groq: headers.get(API_SIGIL_HEADERS.groq) ?? "",
    openrouter: headers.get(API_SIGIL_HEADERS.openrouter) ?? "",
  });
}
