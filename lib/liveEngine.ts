import {
  API_SIGIL_META,
  type ApiSigilProvider,
  type ApiSigils,
  hasLiveSigils,
} from "@/lib/apiSigils";
import type { BugFinding, EngineInfo } from "@/lib/types";

const PROVIDER_TIMEOUT_MS = 8_000;
const MAX_LIVE_OUTPUT_CHARS = 160_000;

interface ProviderConfig {
  id: ApiSigilProvider;
  name: EngineInfo["name"];
  model: string;
  endpoint: string;
}

interface ProviderResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  choices?: Array<{
    message?: { content?: string | null };
  }>;
}

export interface LiveExorcism {
  code: string;
  engine: EngineInfo;
  note: string;
}

interface LiveExorcismInput {
  code: string;
  directive: string;
  findings: BugFinding[];
  sigils: ApiSigils;
  language: string;
}

function providerConfigs(): ProviderConfig[] {
  return API_SIGIL_META.map((provider) => {
    if (provider.id === "gemini") {
      return {
        id: "gemini",
        name: "Gemini",
        model: provider.model,
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent`,
      };
    }
    if (provider.id === "groq") {
      return {
        id: "groq",
        name: "Groq",
        model: provider.model,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
      };
    }
    return {
      id: "openrouter",
      name: "OpenRouter",
      model: provider.model,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
    };
  });
}

function buildSystemPrompt(): string {
  return [
    "You are NecroCode, an expert code exorcist and senior software engineer.",
    "Rewrite the entire supplied artifact into a clean, working version.",
    "Return ONLY the complete corrected source code.",
    "Do not wrap the answer in markdown fences. Do not add commentary or explanations.",
    "Preserve the original language and file type unless the user's ritual directive explicitly asks for a conversion.",
    "The artifact may be any programming language; use the declared ARTIFACT LANGUAGE as ground truth.",
    "Fix every bug you can, including the static findings supplied below.",
    "Honor the user's ritual directive in addition to bug fixing.",
    "Do not leave TODOs, placeholders, or omitted sections. Keep the artifact self-contained.",
    "If the artifact contains browser or Node APIs, keep them intact; do not execute them.",
  ].join("\n");
}

function buildUserPrompt(input: LiveExorcismInput): string {
  const findings =
    input.findings.length > 0
      ? input.findings
          .slice(0, 40)
          .map(
            (bug) =>
              `- L${bug.line} [${bug.severity}] ${bug.title}: ${bug.message} Hint: ${bug.hint}`,
          )
          .join("\n")
      : "None detected by the builtin scanner.";

  return [
    "ARTIFACT LANGUAGE:",
    input.language,
    "",
    "RITUAL DIRECTIVE (optional, honor it):",
    input.directive || "No custom directive. Apply all safe bug fixes and refactors.",
    "",
    "STATIC FINDINGS FROM THE BUILTIN SCANNER:",
    findings,
    "",
    "CURSED ARTIFACT:",
    input.code,
  ].join("\n");
}

function extractCode(raw: string): string {
  const normalized = raw.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").trim();
  const fenced = normalized.match(/```[^\n]*\n([\s\S]*?)```/);
  return (fenced?.[1] ?? normalized).trim();
}

function usableCode(code: string): boolean {
  if (code.length === 0 || code.length > MAX_LIVE_OUTPUT_CHARS) return false;
  // Reject prose-only replies from a model that ignored the output contract.
  if (!/[;{}()=]/.test(code) && code.split("\n").length < 3) return false;
  return true;
}

async function requestProvider(
  provider: ProviderConfig,
  key: string,
  system: string,
  user: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const isGemini = provider.id === "gemini";
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: isGemini
        ? {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          }
        : {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
      body: JSON.stringify(
        isGemini
          ? {
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
              },
            }
          : {
              model: provider.model,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
              temperature: 0.1,
              max_tokens: 8192,
              stream: false,
            },
      ),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as ProviderResponse;
    if (isGemini) {
      return (
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("") ?? null
      );
    }

    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempts every configured BYOK provider in order. Any provider that fails,
 * times out, or returns unusable output yields to the next; if all fail the
 * caller falls back to the deterministic builtin safety net.
 */
export async function tryLiveExorcism(
  input: LiveExorcismInput,
): Promise<LiveExorcism | null> {
  if (!hasLiveSigils(input.sigils)) return null;

  const system = buildSystemPrompt();
  const user = buildUserPrompt(input);

  for (const provider of providerConfigs()) {
    const key = input.sigils[provider.id].trim();
    if (key.length === 0) continue;

    const raw = await requestProvider(provider, key, system, user);
    if (!raw) continue;

    const code = extractCode(raw);
    if (!usableCode(code)) continue;

    return {
      code,
      engine: { name: provider.name, model: provider.model },
      note: `${provider.name} (${provider.model}) performed a live rewrite of ${code.split("\n").length} lines.`,
    };
  }

  return null;
}
