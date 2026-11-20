"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ApiSigils,
  EMPTY_API_SIGILS,
  sigilsToHeaders,
} from "@/lib/apiSigils";
import {
  type AgentEvent,
  type AgentPhase,
  type AppliedFix,
  type BugFinding,
  DEFAULT_ENGINE,
  type EngineInfo,
  type ExorcismSummary,
  type NodeStatus,
  type StageId,
  WORKFLOW_STAGES,
} from "@/lib/types";

export type NodeStatusMap = Record<StageId, NodeStatus>;

export interface RunOptions {
  code: string;
  directive?: string;
  language?: string;
  sigils?: ApiSigils;
}

export interface RestoredRun {
  logs: AgentEvent[];
  summary: ExorcismSummary;
  finalCode: string;
  originalCode: string;
  findings: BugFinding[];
  appliedFixes: AppliedFix[];
  engine: EngineInfo;
}

export interface AgentStreamState {
  phase: AgentPhase;
  progress: number;
  running: boolean;
  logs: AgentEvent[];
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  error: string | null;
  summary: ExorcismSummary | null;
  finalCode: string | null;
  originalCode: string | null;
  findings: BugFinding[];
  appliedFixes: AppliedFix[];
  engine: EngineInfo;
  bugCount: number;
}

function initialNodes(): NodeStatusMap {
  return WORKFLOW_STAGES.reduce((acc, stage) => {
    acc[stage.id] = "pending";
    return acc;
  }, {} as NodeStatusMap);
}

const INITIAL: AgentStreamState = {
  phase: "idle",
  progress: 0,
  running: false,
  logs: [],
  nodes: initialNodes(),
  activeStage: null,
  error: null,
  summary: null,
  finalCode: null,
  originalCode: null,
  findings: [],
  appliedFixes: [],
  engine: DEFAULT_ENGINE,
  bugCount: 0,
};

function reduceEvent(
  prev: AgentStreamState,
  data: AgentEvent,
): AgentStreamState {
  const nodes = { ...prev.nodes };
  if (data.stage && data.nodeStatus) {
    nodes[data.stage] = data.nodeStatus;
  }

  const done = data.phase === "complete";
  if (done) {
    for (const stage of WORKFLOW_STAGES) nodes[stage.id] = "done";
    if ((data.summary?.unresolved ?? 0) > 0) nodes.glitch_scanner = "error";
  }

  return {
    ...prev,
    phase: data.phase,
    progress: data.progress,
    logs: [...prev.logs, data],
    nodes,
    activeStage: done
      ? null
      : data.nodeStatus === "active"
        ? data.stage
        : prev.activeStage,
    running: !done,
    summary: data.summary ?? prev.summary,
    finalCode: data.finalCode ?? prev.finalCode,
    originalCode: data.originalCode ?? prev.originalCode,
    findings: data.findings ?? prev.findings,
    appliedFixes: data.appliedFixes ?? prev.appliedFixes,
    engine: data.engine ?? prev.engine,
    bugCount: prev.bugCount + (data.bug ? 1 : 0),
  };
}

function takeFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  let index = rest.indexOf("\n\n");
  while (index !== -1) {
    frames.push(rest.slice(0, index));
    rest = rest.slice(index + 2);
    index = rest.indexOf("\n\n");
  }
  return { frames, rest };
}

function parseFrame(frame: string): AgentEvent | null {
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join("\n")) as AgentEvent;
  } catch {
    return null;
  }
}

/**
 * Opens a POST SSE stream to /api/agent/stream and folds every AgentEvent
 * into HUD state. POST keeps large code snippets out of the URL, while the
 * wire format remains standard text/event-stream.
 */
export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    close();
    setState({ ...INITIAL, nodes: initialNodes() });
  }, [close]);

  const run = useCallback(
    async ({ code, directive = "", language = "javascript", sigils }: RunOptions) => {
      close();
      setState({
        ...INITIAL,
        nodes: initialNodes(),
        running: true,
        phase: "thinking",
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/agent/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...sigilsToHeaders(sigils ?? EMPTY_API_SIGILS),
          },
          body: JSON.stringify({ code, directive, language }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(
            `The séance refused the artifact (HTTP ${response.status}).`,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = takeFrames(buffer);
          buffer = rest;
          for (const frame of frames) {
            const event = parseFrame(frame);
            if (event) setState((prev) => reduceEvent(prev, event));
          }
        }

        buffer += decoder.decode();
        const tail = takeFrames(buffer);
        for (const frame of tail.frames) {
          const event = parseFrame(frame);
          if (event) setState((prev) => reduceEvent(prev, event));
        }

        setState((prev) =>
          prev.running
            ? {
                ...prev,
                running: false,
                error: "The séance ended before the final seal was drawn.",
              }
            : prev,
        );
      } catch (cause) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          running: false,
          error:
            cause instanceof Error
              ? cause.message
              : "The connection to the crypt collapsed.",
        }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [close],
  );

  const restore = useCallback(
    (run: RestoredRun) => {
      close();
      const nodes = initialNodes();
      for (const stage of WORKFLOW_STAGES) nodes[stage.id] = "done";
      if (run.summary.unresolved > 0) nodes.glitch_scanner = "error";

      setState({
        ...INITIAL,
        phase: "complete",
        progress: 100,
        running: false,
        logs: run.logs,
        nodes,
        activeStage: null,
        summary: run.summary,
        finalCode: run.finalCode,
        originalCode: run.originalCode,
        findings: run.findings,
        appliedFixes: run.appliedFixes,
        engine: run.engine,
        bugCount: run.summary.detected,
      });
    },
    [close],
  );

  useEffect(() => close, [close]);

  return { state, run, reset, restore };
}
