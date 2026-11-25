import type { NextRequest } from "next/server";
import { executeLocal } from "@/lib/hostRunner";
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

  // Step A · Paiza first.
  const paiza = await executePaiza(selected, source);
  if (paiza.ok) return json(paiza);

  // Step A fallback · Piston.
  const piston = await executePiston(selected, source);
  if (piston.ran || piston.ok) return json(piston);

  // Step B · Real host toolchain in an isolated temp directory.
  const local = await executeLocal(selected, source);
  if (local.ran) return json(local);

  // Step C · Strict no-hallucination guard.
  // If a remote compiler really ran and reported a failure, return that real
  // output rather than pretending the machine is offline.
  if (paiza.ran) return json(paiza);

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
