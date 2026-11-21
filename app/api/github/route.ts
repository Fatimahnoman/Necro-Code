import type { NextRequest } from "next/server";
import {
  type GitHubSummonFailure,
  type GitHubSummonSuccess,
  parseGitHubFileUrl,
} from "@/lib/github";
import { languageIdFromFilename } from "@/lib/languages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Matches the SSE route's artifact cap so a summoned file is never truncated. */
const MAX_CODE_CHARS = 24_000;
/** UTF-8 worst case is 4 bytes per char; stop reading past this. */
const MAX_BYTES = MAX_CODE_CHARS * 4;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 2;
const RAW_HOST = "raw.githubusercontent.com";

function fail(message: string, status: number): Response {
  return Response.json({ ok: false, message } satisfies GitHubSummonFailure, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Fetch only from raw.githubusercontent.com, following at most two same-host redirects. */
async function fetchRaw(rawUrl: string, signal: AbortSignal): Promise<Response> {
  let target = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: { Accept: "text/plain, */*;q=0.1" },
    });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    const next = new URL(location, target);
    if (next.protocol !== "https:" || next.hostname !== RAW_HOST) {
      throw new Error("redirect-blocked");
    }
    target = next.toString();
  }
  throw new Error("too-many-redirects");
}

async function readCapped(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return null;
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function POST(req: NextRequest): Promise<Response> {
  let input = "";
  try {
    const body = (await req.json()) as { url?: unknown };
    if (typeof body.url === "string") input = body.url;
  } catch {
    return fail("Send JSON like { \"url\": \"https://github.com/...\" }.", 400);
  }

  const parsed = parseGitHubFileUrl(input);
  if (!parsed.ok) return fail(parsed.message, 400);
  const { file } = parsed;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchRaw(file.rawUrl, controller.signal);

    if (response.status === 404) {
      return fail(
        "File not found. Check the branch and path; private repositories are not supported.",
        404,
      );
    }
    if (!response.ok) {
      return fail(`GitHub returned HTTP ${response.status}.`, 502);
    }

    const bytes = await readCapped(response);
    if (bytes === null) {
      return fail(
        `File is larger than the ${MAX_CODE_CHARS.toLocaleString("en-US")}-character ritual limit.`,
        413,
      );
    }
    if (bytes.includes(0)) {
      return fail("That looks like a binary file, not source code.", 415);
    }

    let code: string;
    try {
      code = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return fail("The file is not valid UTF-8 text.", 415);
    }
    code = code.replace(/^\uFEFF/, "");

    if (code.trim().length === 0) return fail("The file is empty.", 422);
    if (code.length > MAX_CODE_CHARS) {
      return fail(
        `File is larger than the ${MAX_CODE_CHARS.toLocaleString("en-US")}-character ritual limit.`,
        413,
      );
    }

    const result: GitHubSummonSuccess = {
      ok: true,
      code,
      owner: file.owner,
      repo: file.repo,
      ref: file.ref,
      path: file.path,
      filename: file.filename,
      language: languageIdFromFilename(file.filename),
      lines: code.split(/\r\n?|\n/).length,
    };
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (controller.signal.aborted) {
      return fail(`GitHub did not answer within ${FETCH_TIMEOUT_MS / 1000} seconds.`, 504);
    }
    if (cause instanceof Error && cause.message === "redirect-blocked") {
      return fail("GitHub redirected to a host outside raw.githubusercontent.com.", 502);
    }
    return fail("Could not reach GitHub.", 502);
  } finally {
    clearTimeout(timer);
  }
}
