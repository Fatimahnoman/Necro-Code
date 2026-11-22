"use client";

import { Component, type ReactNode } from "react";

/**
 * Error boundary for WebGL scenes. If a React Three Fiber canvas throws while
 * rendering (for example, the browser cannot create a WebGL context), it
 * renders `fallback` and calls `onError` once instead of unmounting the page.
 */
export class WebGLBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError?.();
  }

  render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

/** `true` when this browser can create a WebGL (1 or 2) context. */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    const lose = (context as WebGLRenderingContext | null)?.getExtension?.(
      "WEBGL_lose_context",
    );
    lose?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
}
