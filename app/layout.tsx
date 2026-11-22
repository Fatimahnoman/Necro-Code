import type { Metadata, Viewport } from "next";
import {
  Cinzel,
  Cinzel_Decorative,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Fonts are downloaded at build time and self-hosted by Next.js, so the
// browser never calls Google at runtime. Each exposes a CSS variable that
// `tailwind.config.ts` maps to a font family.
const brandFont = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
  variable: "--font-brand",
});
const ritualFont = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-ritual",
});
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-mono",
});
const uiFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

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
  themeColor: "#040408",
  width: "device-width",
  initialScale: 1,
  // Lets `env(safe-area-inset-*)` (used by `.pb-safe`) report the notch/home bar.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${brandFont.variable} ${ritualFont.variable} ${monoFont.variable} ${uiFont.variable}`}
    >
      <body className="min-h-screen bg-void font-sans text-bone antialiased">
        {children}
      </body>
    </html>
  );
}
