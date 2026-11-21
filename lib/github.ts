/**
 * GitHub file-URL parsing shared by the Spellbook (client) and
 * `/api/github` (server). Pure and dependency-free.
 *
 * Accepted inputs (scheme optional, query/hash ignored):
 *   https://github.com/<owner>/<repo>/blob/<ref>/<path>
 *   https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
 *
 * The ref is assumed to be the first segment after `blob/`. Branch names
 * that contain `/` still fetch correctly (GitHub resolves them), but the
 * repo-relative `path` will then include the rest of the branch name.
 */

import type { LanguageId } from "@/lib/languages";

export interface GitHubFileRef {
  owner: string;
  repo: string;
  ref: string;
  /** Repo-relative path, e.g. `src/lib/cache.js`. */
  path: string;
  /** Last path segment, e.g. `cache.js`. */
  filename: string;
  /** The only URL the server is allowed to fetch. */
  rawUrl: string;
}

/** `POST /api/github` success body. */
export interface GitHubSummonSuccess {
  ok: true;
  code: string;
  owner: string;
  repo: string;
  ref: string;
  path: string;
  filename: string;
  /** Detected from the file extension; `null` when unknown. */
  language: LanguageId | null;
  lines: number;
}

/** `POST /api/github` error body. */
export interface GitHubSummonFailure {
  ok: false;
  message: string;
}

export type GitHubSummonResponse = GitHubSummonSuccess | GitHubSummonFailure;

export type GitHubParseResult =
  | { ok: true; file: GitHubFileRef }
  | { ok: false; message: string };

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_URL_CHARS = 2_048;

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function parseGitHubFileUrl(input: string): GitHubParseResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Paste a public GitHub file URL." };
  }
  if (trimmed.length > MAX_URL_CHARS) {
    return { ok: false, message: "That URL is too long." };
  }

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, message: "That is not a valid URL." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "Only http(s) GitHub URLs are supported." };
  }
  if (url.username || url.password || url.port) {
    return { ok: false, message: "URLs with credentials or ports are not allowed." };
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter((part) => part.length > 0);

  let owner: string;
  let repo: string;
  let rest: string[];

  if (host === "github.com" || host === "www.github.com") {
    if (segments.length < 5 || segments[2] !== "blob") {
      return {
        ok: false,
        message:
          "Use a file URL like github.com/<owner>/<repo>/blob/<branch>/<path>.",
      };
    }
    [owner, repo] = segments;
    rest = segments.slice(3);
  } else if (host === "raw.githubusercontent.com") {
    if (segments.length < 4) {
      return {
        ok: false,
        message: "Use a raw URL like raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>.",
      };
    }
    [owner, repo] = segments;
    rest = segments.slice(2);
  } else {
    return {
      ok: false,
      message: "Only github.com and raw.githubusercontent.com URLs are supported.",
    };
  }

  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") {
    return { ok: false, message: "The owner or repository name is invalid." };
  }

  const decoded: string[] = [];
  for (const segment of rest) {
    const value = decodeSegment(segment);
    if (
      value === null ||
      value === "." ||
      value === ".." ||
      /[\\/\u0000-\u001f]/.test(value)
    ) {
      return { ok: false, message: "The file path contains invalid segments." };
    }
    decoded.push(value);
  }

  const [ref, ...pathParts] = decoded;
  if (!ref || pathParts.length === 0) {
    return { ok: false, message: "The URL must point at a file, not a branch or folder." };
  }

  const encodedRest = decoded.map((part) => encodeURIComponent(part)).join("/");
  const path = pathParts.join("/");

  return {
    ok: true,
    file: {
      owner,
      repo,
      ref,
      path,
      filename: pathParts[pathParts.length - 1],
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${encodedRest}`,
    },
  };
}
