import type {
  AgentEvent,
  AppliedFix,
  BugFinding,
  EngineInfo,
  ExorcismSummary,
} from "@/lib/types";

export const MAX_HISTORY_ENTRIES = 10;
export const HISTORY_STORAGE_KEY = "necrocode.grimoire-history.v1";

export interface GrimoireHistoryEntry {
  id: string;
  createdAt: string;
  filename: string;
  directive: string;
  language?: string;
  preview: string;
  engine: EngineInfo;
  summary: ExorcismSummary;
  originalCode: string;
  purifiedCode: string;
  findings: BugFinding[];
  appliedFixes: AppliedFix[];
  logs: AgentEvent[];
}

export function createHistoryId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function historyPreview(code: string): string {
  const firstLine =
    code
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "Untitled artifact";
  return firstLine.length > 120
    ? `${firstLine.slice(0, 117)}…`
    : firstLine;
}

/** Strip the terminal's duplicated code transcription before storing. */
export function slimHistoryLogs(logs: AgentEvent[]): AgentEvent[] {
  return logs
    .filter((log) => log.level !== "code")
    .map((log) => {
      if (log.phase !== "complete") return log;
      return {
        ...log,
        finalCode: undefined,
        originalCode: undefined,
        findings: undefined,
        appliedFixes: undefined,
      };
    });
}

export function historyFingerprint(
  entry: Pick<GrimoireHistoryEntry, "createdAt" | "logs" | "purifiedCode" | "summary">,
): string {
  const first = entry.logs[0]?.ts ?? entry.createdAt;
  const last = entry.logs.at(-1)?.ts ?? entry.createdAt;
  return [
    first,
    last,
    entry.purifiedCode.length,
    entry.summary.detected,
    entry.summary.fixed,
    entry.summary.unresolved,
  ].join("|");
}

export function isGrimoireHistoryEntry(
  value: unknown,
): value is GrimoireHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<GrimoireHistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.createdAt === "string" &&
    typeof entry.filename === "string" &&
    typeof entry.directive === "string" &&
    (entry.language === undefined || typeof entry.language === "string") &&
    typeof entry.preview === "string" &&
    typeof entry.originalCode === "string" &&
    typeof entry.purifiedCode === "string" &&
    typeof entry.engine === "object" &&
    entry.engine !== null &&
    typeof entry.summary === "object" &&
    entry.summary !== null &&
    Array.isArray(entry.findings) &&
    Array.isArray(entry.appliedFixes) &&
    Array.isArray(entry.logs)
  );
}
