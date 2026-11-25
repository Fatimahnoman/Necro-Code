import type { NextRequest } from "next/server";
import { executeLocal } from "@/lib/hostRunner";
import { evaluateOffline } from "@/lib/offlineEvaluator";
import { executePaiza, executePiston, type RemoteRunResult } from "@/lib/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function offlineUnavailable(label: string): RemoteRunResult {
  return {
    ok: false,
    status: "error",
    language: "javascript",
    languageLabel: label,
    stdout: "",
    stderr: "",
    build: "",
    exitCode: "1",
    duration: null,
    memory: null,
    transport: "none",
    ran: false,
    networkError: true,
    message: `[OFFLINE RUNTIME UNAVAILABLE] No local compiler found for ${label} and remote runners are offline. Connect to the internet (or deploy to Vercel) to execute real ${label} binaries.`,
  };
}

export async function POST(req: NextRequest): Promise<Response> {
  let language = "";
  let code = "";

  try {
    const body = (await req.json()) as {
      language?: unknown;
      code?: unknown;
    };
    if (typeof body.language === "string") language = body.language;
    if (typeof body.code === "string") code = body.code;
  } catch {
    return Response.json(
      {
        ok: false,
        message: "The remote pyre rejected the offering (invalid JSON).",
      },
      { status: 400 },
    );
  }

  if (language.trim().length === 0 || code.trim().length === 0) {
    return Response.json(
      {
        ok: false,
        message: "A language and a non-empty artifact are required.",
      },
      { status: 400 },
    );
  }

  const selected = language.trim();
  const source = code;

  // Every layer is bounded to 4s and starts together, so the browser never
  // waits longer than its own strict 5s deadline. Selection order still
  // prefers Paiza, then Piston, then the real host toolchain.
  const [paiza, piston, local] = await Promise.all([
    executePaiza(selected, source),
    executePiston(selected, source),
    executeLocal(selected, source),
  ]);

  if (paiza.ok) return json(paiza);
  if (piston.ok) return json(piston);
  if (local.ok) return json(local);

  // A compiler that really ran is truth, even when it reported a failure.
  if (paiza.ran) return json(paiza);
  if (piston.ran) return json(piston);
  if (local.ran) return json(local);

  // Step C · Deterministic offline statement evaluator. It only evaluates
  // statements it can actually parse and tags every line it produces.
  const evaluated = evaluateOffline(selected, source);
  if (evaluated) return json(evaluated);

  const label = paiza.languageLabel;
  const remoteOffline = paiza.networkError && (piston.networkError || !piston.ran);
  const result: RemoteRunResult = remoteOffline
    ? offlineUnavailable(label)
    : {
        ...paiza,
        transport: "none",
        message: paiza.message ?? piston.message ?? "No runtime could execute this artifact.",
      };

  return json(result);
}

function json(result: RemoteRunResult): Response {
  return Response.json(result, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
