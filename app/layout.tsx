import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "NecroCode — 3D Horror AI Code Exorcist",
  description:
    "A 3D horror cyber-gothic AI code exorcist studio that scans real JS/TS snippets for corruption, streams live reasoning into an interactive WebGL ritual graph, and outputs purified code. Built for Kiroween 2026.",
  keywords: [
    "AI exorcist",
    "code debugger",
    "cyber gothic",
    "horror UI",
    "3D",
    "WebGL",
    "React Three Fiber",
    "Next.js",
    "Kiro",
    "SSE",
  ],
  authors: [{ name: "NecroCode" }],
  openGraph: {
    title: "NecroCode — 3D Horror AI Code Exorcist",
    description:
      "Feed the crypt a cursed snippet. Watch the 3D ritual graph hunt real bugs, stream the exorcism, and emit clean code.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06060c",
  width: "device-width",
  initialScale: 1,
  // Lets `env(safe-area-inset-*)` (used by `.pb-safe`) report the notch/home bar.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void font-sans text-bone antialiased">
        {children}
      </body>
    </html>
  );
}
