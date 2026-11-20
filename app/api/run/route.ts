import type { NextRequest } from "next/server";
import { executeRemote } from "@/lib/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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

  const result = await executeRemote(language.trim(), code);
  return Response.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
