import type { NextRequest } from "next/server";
import { analyzeCode, exorciseCode } from "@/lib/analyzer";
import {
  type ApiSigils,
  hasLiveSigils,
  sigilsFromHeaders,
} from "@/lib/apiSigils";
import { DEFAULT_CURSED_CODE } from "@/lib/cursedCode";
import {
  findLanguage,
  isAnalyzerLanguage,
  isLanguageId,
} from "@/lib/languages";
import { tryLiveExorcism } from "@/lib/liveEngine";
import { healthScore } from "@/lib/report";
import {
  type AgentEvent,
  type AgentPhase,
  type AppliedFix,
  type BugFinding,
  DEFAULT_ENGINE,
  type EngineInfo,
  type ExorcismReport,
  type ExorcismSummary,
  type LogLevel,
  type NodeStatus,
  type StageId,
  WORKFLOW_STAGES,
} from "@/lib/types";

// SSE must always stream — never statically optimize.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow long rituals on serverless hosts (large snippets, many findings).
export const maxDuration = 60;

const MAX_CODE_CHARS = 24_000;
const MAX_DIRECTIVE_CHARS = 500;
const MAX_SCAN_LOGS = 18;
const MAX_FIX_LOGS = 18;
const MAX_CODE_LINES = 260;

interface ScriptStep {
  phase: AgentPhase;
  stage: StageId | null;
  nodeStatus: NodeStatus | null;
  level: LogLevel;
  message: string;
  delay: number;
  /** Marks the stage as processed for progress accounting. */
  advance?: boolean;
  bug?: BugFinding;
  summary?: ExorcismSummary;
  finalCode?: string;
  originalCode?: string;
  findings?: BugFinding[];
  appliedFixes?: AppliedFix[];
}

function levelFor(bug: BugFinding): LogLevel {
  if (bug.severity === "critical") return "error";
  if (bug.severity === "warning") return "warn";
  return "info";
}

function buildScript(
  truncated: boolean,
  report: ExorcismReport,
  engine: EngineInfo,
  directive: string,
  liveNote: string,
  liveAttempted: boolean,
  language: string,
  analyzerLanguage: boolean,
): ScriptStep[] {
  const { findings, appliedFixes, fixed, summary } = report;
  const runnerLanguage = findLanguage(language);
  const steps: ScriptStep[] = [];
  const push = (step: ScriptStep) => steps.push(step);

  push({
    phase: "idle",
    stage: null,
    nodeStatus: null,
    level: "system",
    message:
      engine.name === "Heuristic"
        ? "// NecroCode séance online — builtin safety net engaged…"
        : `// NecroCode séance online — LIVE AI ENGINE: ${engine.name} (${engine.model})…`,
    delay: 180,
  });
  push({
    phase: "thinking",
    stage: null,
    nodeStatus: null,
    level: "info",
    message: `» Cursed artifact received: ${summary.lines} lines · ${summary.chars} chars`,
    delay: 300,
  });
  if (!analyzerLanguage) {
    push({
      phase: "thinking",
      stage: null,
      nodeStatus: null,
      level: "warn",
      message: `⚠ Builtin scanner only understands JavaScript/TypeScript — ${runnerLanguage.label} relies on the live engine and the sandbox.`,
      delay: 260,
    });
  }
  if (directive.length > 0) {
    push({
      phase: "thinking",
      stage: null,
      nodeStatus: null,
      level: "system",
      message: `» RITUAL DIRECTIVE: ${directive}`,
      delay: 220,
    });
  }
  if (directive.length > 0 && engine.name === "Heuristic") {
    push({
      phase: "thinking",
      stage: null,
      nodeStatus: null,
      level: "warn",
      message: liveAttempted
        ? "⚠ Live sigils failed or returned no usable code — the builtin safety net can only apply known curses."
        : "⚠ RITUAL DIRECTIVE needs a live API sigil — the builtin safety net will only fix known curses.",
      delay: 260,
    });
  }
  if (truncated) {
    push({
      phase: "thinking",
      stage: null,
      nodeStatus: null,
      level: "warn",
      message: `⚠ Artifact exceeded ${MAX_CODE_CHARS} chars — the excess was banished before scanning.`,
      delay: 240,
    });
  }

  // ── Stage 1 · Corrupted Code ───────────────────────────────
  push({
    phase: "thinking",
    stage: "input_code",
    nodeStatus: "active",
    level: "system",
    message: "[corrupted_code] binding artifact to the ritual circle…",
    delay: 260,
  });
  push({
    phase: "executing",
    stage: "input_code",
    nodeStatus: "active",
    level: "info",
    message: "  ↳ masked strings, comments & sigils — syntax skeleton exposed",
    delay: 260,
  });
  push({
    phase: "executing",
    stage: "input_code",
    nodeStatus: "done",
    level: "success",
    message: "[corrupted_code] ✓ artifact bound · 0 bind failures",
    delay: 260,
    advance: true,
  });

  // ── Stage 2 · Spectral Scanner ─────────────────────────────
  push({
    phase: "tool_call",
    stage: "glitch_scanner",
    nodeStatus: "active",
    level: "system",
    message: analyzerLanguage
      ? "[spectral_scanner] invoking scan_for_corruption()…"
      : `[spectral_scanner] no builtin rules for ${runnerLanguage.label} — preparing a pass-through…`,
    delay: 300,
  });

  if (findings.length === 0) {
    push({
      phase: "executing",
      stage: "glitch_scanner",
      nodeStatus: "done",
      level: analyzerLanguage ? "success" : "info",
      message: analyzerLanguage
        ? "[spectral_scanner] ✓ no corruption detected — the artifact is already pure"
        : `[spectral_scanner] ↳ ${runnerLanguage.label} will be verified by the sandbox after the ritual`,
      delay: 340,
      advance: true,
    });
  } else {
    const visible = findings.slice(0, MAX_SCAN_LOGS);
    for (const bug of visible) {
      push({
        phase: "executing",
        stage: "glitch_scanner",
        nodeStatus: "error",
        level: levelFor(bug),
        message: `  [L${bug.line}] ${bug.title}: ${bug.message}`,
        delay: 140,
        bug,
      });
    }
    if (findings.length > visible.length) {
      push({
        phase: "executing",
        stage: "glitch_scanner",
        nodeStatus: "error",
        level: "warn",
        message: `  ↳ …and ${findings.length - visible.length} more corruption(s) hidden in the dark`,
        delay: 160,
      });
    }
    push({
      phase: "executing",
      stage: "glitch_scanner",
      nodeStatus: "error",
      level: "error",
      message: `[spectral_scanner] ✗ ${summary.detected} corruption(s) · ${summary.critical} critical · ${summary.warning} warning`,
      delay: 300,
      advance: true,
    });
  }

  // ── Stage 3 · Kiro Exorcism Reasoning ──────────────────────
  push({
    phase: "thinking",
    stage: "exorcism_reasoning",
    nodeStatus: "active",
    level: "system",
    message: "[kiro_reasoning] summoning counter-sigils…",
    delay: 300,
  });

  if (liveNote.length > 0) {
    push({
      phase: "executing",
      stage: "exorcism_reasoning",
      nodeStatus: "active",
      level: "info",
      message: `  ↳ ${liveNote}`,
      delay: 220,
    });
  }

  if (appliedFixes.length === 0) {
    push({
      phase: "executing",
      stage: "exorcism_reasoning",
      nodeStatus: "done",
      level: "info",
      message: analyzerLanguage
        ? "[kiro_reasoning] ↳ no safe automatic rite available — manual intervention required"
        : `[kiro_reasoning] ↳ no deterministic counter-sigils for ${runnerLanguage.label} — live engine or manual review required`,
      delay: 320,
      advance: true,
    });
  } else {
    for (const fix of appliedFixes.slice(0, MAX_FIX_LOGS)) {
      push({
        phase: "executing",
        stage: "exorcism_reasoning",
        nodeStatus: "active",
        level: "system",
        message: `  ↳ exorcising '${fix.id}' @ L${fix.line} — ${fix.description}`,
        delay: 150,
      });
    }
    if (appliedFixes.length > MAX_FIX_LOGS) {
      push({
        phase: "executing",
        stage: "exorcism_reasoning",
        nodeStatus: "active",
        level: "info",
        message: `  ↳ …and ${appliedFixes.length - MAX_FIX_LOGS} more counter-sigil(s) applied`,
        delay: 160,
      });
    }
    push({
      phase: "executing",
      stage: "exorcism_reasoning",
      nodeStatus: "done",
      level: "success",
      message: `[kiro_reasoning] ✓ ${summary.fixed} sigil(s) applied`,
      delay: 300,
      advance: true,
    });
  }

  if (summary.unresolved === 0 && findings.length > 0) {
    push({
      phase: "executing",
      stage: "glitch_scanner",
      nodeStatus: "done",
      level: "success",
      message: "[spectral_scanner] ✓ corruption cleared — the node is purified",
      delay: 260,
    });
  }

  // ── Stage 4 · Purified Output ──────────────────────────────
  push({
    phase: "executing",
    stage: "clean_code_output",
    nodeStatus: "active",
    level: "system",
    message: "[purified_output] transcribing the purified artifact…",
    delay: 300,
  });

  const fixedLines = fixed.split("\n");
  for (const line of fixedLines.slice(0, MAX_CODE_LINES)) {
    push({
      phase: "executing",
      stage: "clean_code_output",
      nodeStatus: "active",
      level: "code",
      message: line,
      delay: 22,
    });
  }
  if (fixedLines.length > MAX_CODE_LINES) {
    push({
      phase: "executing",
      stage: "clean_code_output",
      nodeStatus: "active",
      level: "warn",
      message: `  ↳ terminal truncated (${fixedLines.length - MAX_CODE_LINES} lines) — use Copy to retrieve the full artifact`,
      delay: 180,
    });
  }
  push({
    phase: "purified",
    stage: "clean_code_output",
    nodeStatus: "done",
    level: "success",
    message: `[purified_output] ✓ ${fixedLines.length} lines emitted · ${summary.unresolved} residual warning(s)`,
    delay: 300,
    advance: true,
    summary,
    finalCode: fixed,
    originalCode: report.original,
    findings,
    appliedFixes,
  });

  if (summary.unresolved > 0) {
    push({
      phase: "executing",
      stage: "glitch_scanner",
      nodeStatus: "error",
      level: "warn",
      message: `⚠ ${summary.unresolved} unresolved sigil(s) remain — inspect the terminal`,
      delay: 300,
    });
  }

  if (summary.healthBefore !== undefined && summary.healthAfter !== undefined) {
    push({
      phase: "executing",
      stage: null,
      nodeStatus: null,
      level: summary.healthAfter >= 80 ? "success" : "warn",
      message: `» Code Health & Security Score: ${summary.healthBefore}/100 → ${summary.healthAfter}/100`,
      delay: 220,
    });
  }

  push({
    phase: "complete",
    stage: null,
    nodeStatus: null,
    level: "success",
    message: `◆ Exorcism complete — ${summary.fixed} fixed · ${summary.unresolved} residual · ${engine.name} ◆`,
    delay: 360,
    summary,
    finalCode: fixed,
    originalCode: report.original,
    findings,
    appliedFixes,
  });

  return steps;
}

const encoder = new TextEncoder();

function sse(event: AgentEvent): Uint8Array {
  return encoder.encode(`event: agent\ndata: ${JSON.stringify(event)}\n\n`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function passThroughReport(code: string): ExorcismReport {
  const original = code.replace(/\r\n?/g, "\n");
  return {
    original,
    fixed: original,
    findings: [],
    appliedFixes: [],
    remaining: [],
    summary: {
      detected: 0,
      fixed: 0,
      unresolved: 0,
      lines: original.length === 0 ? 0 : original.split("\n").length,
      chars: original.length,
      critical: 0,
      warning: 0,
      info: 0,
    },
  };
}

async function handle(
  rawCode: string,
  rawDirective: string,
  rawLanguage: string,
  sigils: ApiSigils,
): Promise<Response> {
  const source = rawCode.trim().length > 0 ? rawCode : DEFAULT_CURSED_CODE;
  const truncated = source.length > MAX_CODE_CHARS;
  const code = truncated ? source.slice(0, MAX_CODE_CHARS) : source;
  const directive = rawDirective.trim().slice(0, MAX_DIRECTIVE_CHARS);
  const language = isLanguageId(rawLanguage) ? rawLanguage : "javascript";
  const analyzerLanguage = isAnalyzerLanguage(language);
  const runnerLanguage = findLanguage(language);

  const baseReport = analyzerLanguage
    ? exorciseCode(code)
    : passThroughReport(code);
  const liveAttempted = hasLiveSigils(sigils);
  const live = liveAttempted
    ? await tryLiveExorcism({
        code,
        directive,
        findings: baseReport.findings,
        sigils,
        language: runnerLanguage.label,
      })
    : null;

  const engine = live?.engine ?? DEFAULT_ENGINE;
  const fixed = live?.code ?? baseReport.fixed;
  const remaining = analyzerLanguage
    ? fixed === baseReport.fixed
      ? baseReport.remaining
      : analyzeCode(fixed)
    : [];
  const summary: ExorcismSummary = {
    ...baseReport.summary,
    fixed: analyzerLanguage
      ? Math.max(0, baseReport.summary.detected - remaining.length)
      : 0,
    unresolved: remaining.length,
    ...(analyzerLanguage
      ? {
          healthBefore: healthScore(baseReport.findings),
          healthAfter: healthScore(remaining),
        }
      : {}),
  };
  const report: ExorcismReport = {
    ...baseReport,
    fixed,
    remaining,
    summary,
  };

  const script = buildScript(
    truncated,
    report,
    engine,
    directive,
    live?.note ?? "",
    liveAttempted,
    language,
    analyzerLanguage,
  );
  const stageCount = WORKFLOW_STAGES.length;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let seq = 0;
        let advanced = 0;

        for (const step of script) {
          await wait(step.delay);

          if (step.advance) advanced = Math.min(stageCount, advanced + 1);

          const progress =
            step.phase === "complete"
              ? 100
              : Math.min(99, Math.round((advanced / stageCount) * 100));

          const payload: AgentEvent = {
            seq: seq++,
            phase: step.phase,
            stage: step.stage,
            nodeStatus: step.nodeStatus,
            level: step.level,
            message: step.message,
            progress,
            ts: new Date().toISOString(),
            bug: step.bug,
            summary: step.summary,
            finalCode: step.finalCode,
            originalCode: step.originalCode,
            findings: step.findings,
            appliedFixes: step.appliedFixes,
            engine,
          };

          controller.enqueue(sse(payload));
        }

        controller.close();
      } catch {
        // Client disconnected mid-séance: close quietly.
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const directive = req.nextUrl.searchParams.get("directive") ?? "";
  const language = req.nextUrl.searchParams.get("language") ?? "javascript";
  return handle(
    code,
    directive,
    language,
    sigilsFromHeaders(req.headers),
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  let code = "";
  let directive = "";
  let language = "javascript";
  try {
    const body = (await req.json()) as {
      code?: unknown;
      directive?: unknown;
      language?: unknown;
    };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.directive === "string") directive = body.directive;
    if (typeof body.language === "string") language = body.language;
  } catch {
    // No/invalid body — fall back to the default cursed artifact.
  }
  return handle(
    code,
    directive,
    language,
    sigilsFromHeaders(req.headers),
  );
}
