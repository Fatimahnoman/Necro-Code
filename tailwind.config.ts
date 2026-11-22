import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#040408",
        crypt: "#070A10",
        charnel: "#0B0F17",
        blood: {
          DEFAULT: "#EF4444",
          dark: "#7F1D1D",
          glow: "#DC2626",
        },
        haunt: {
          DEFAULT: "#9333EA",
          dark: "#4C1D95",
          glow: "#A855F7",
        },
        spectral: {
          DEFAULT: "#06B6D4",
          dark: "#164E63",
          glow: "#22D3EE",
        },
        ectoplasm: {
          DEFAULT: "#4ADE80",
          dark: "#14532D",
        },
        bone: "#E2D9C8",
        gold: {
          DEFAULT: "#E2D9C8",
          dim: "#A89C82",
          deep: "#6B5E45",
        },
        amethyst: {
          DEFAULT: "#9D4EDD",
          glow: "#B67CF0",
        },
        crimson: "#FF003C",
        neon: "#00FF66",
      },
      fontFamily: {
        // Code + logs.
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        // UI controls (buttons, pills, tabs, labels).
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Ritual headers + stage titles.
        display: ["var(--font-ritual)", "Georgia", "Cambria", "serif"],
        // Brand wordmark only.
        brand: ["var(--font-brand)", "var(--font-ritual)", "Georgia", "serif"],
      },
      boxShadow: {
        "glow-blood":
          "0 0 16px rgba(239,68,68,0.45), 0 0 42px rgba(239,68,68,0.16)",
        "glow-blood-xl":
          "0 0 10px rgba(239,68,68,0.7), 0 0 30px rgba(239,68,68,0.42), 0 0 64px rgba(239,68,68,0.2)",
        "glow-haunt":
          "0 0 16px rgba(147,51,234,0.45), 0 0 42px rgba(147,51,234,0.16)",
        "glow-haunt-xl":
          "0 0 10px rgba(147,51,234,0.7), 0 0 30px rgba(147,51,234,0.42), 0 0 64px rgba(147,51,234,0.2)",
        "glow-spectral":
          "0 0 16px rgba(6,182,212,0.45), 0 0 42px rgba(6,182,212,0.16)",
        "glow-spectral-xl":
          "0 0 10px rgba(6,182,212,0.7), 0 0 30px rgba(6,182,212,0.42), 0 0 64px rgba(6,182,212,0.2)",
        "glow-ectoplasm":
          "0 0 16px rgba(74,222,128,0.45), 0 0 42px rgba(74,222,128,0.16)",
        "glow-ectoplasm-xl":
          "0 0 10px rgba(74,222,128,0.7), 0 0 30px rgba(74,222,128,0.42), 0 0 64px rgba(74,222,128,0.2)",
        inset: "inset 0 0 40px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        "rune-grid":
          "linear-gradient(rgba(239,68,68,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.045) 1px, transparent 1px)",
        "blood-fade":
          "radial-gradient(circle at 50% 0%, rgba(239,68,68,0.18), transparent 60%)",
      },
      backgroundSize: {
        grid: "42px 42px",
      },
      keyframes: {
        flicker: {
          "0%, 18%, 22%, 25%, 53%, 57%, 100%": { opacity: "1" },
          "20%, 24%, 55%": { opacity: "0.35" },
        },
        "fog-drift": {
          "0%": { transform: "translate3d(-3%, 0, 0) scale(1.05)" },
          "50%": { transform: "translate3d(3%, -2%, 0) scale(1.12)" },
          "100%": { transform: "translate3d(-3%, 0, 0) scale(1.05)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-7px)" },
        },
        "rune-pulse": {
          "0%, 100%": { opacity: "0.35", filter: "brightness(0.9)" },
          "50%": { opacity: "1", filter: "brightness(1.4)" },
        },
        "blood-pulse": {
          "0%, 100%": {
            opacity: "0.35",
            transform: "scale(1)",
            boxShadow: "0 0 0 rgba(239,68,68,0)",
          },
          "50%": {
            opacity: "1",
            transform: "scale(1.015)",
            boxShadow: "0 0 40px rgba(239,68,68,0.5)",
          },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        glitch: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-1px)" },
          "40%": { transform: "translateX(1px)" },
          "60%": { transform: "translateX(-1px)" },
          "80%": { transform: "translateX(1px)" },
        },
        "trail-flow": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "grid-drift": {
          "0%": { backgroundPosition: "0px 0px" },
          "100%": { backgroundPosition: "42px 42px" },
        },
        "badge-pop": {
          "0%": { opacity: "0", transform: "scale(0.7) translateY(4px)" },
          "60%": { opacity: "1", transform: "scale(1.05) translateY(0)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        heartbeat: {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "14%": { opacity: "0.8", transform: "scale(1.08)" },
          "28%": { opacity: "0.45", transform: "scale(1)" },
          "42%": { opacity: "0.7", transform: "scale(1.05)" },
          "60%": { opacity: "0.35", transform: "scale(1)" },
        },
      },
      animation: {
        flicker: "flicker 7s linear infinite",
        "fog-drift": "fog-drift 28s ease-in-out infinite",
        float: "float 4s ease-in-out infinite",
        "rune-pulse": "rune-pulse 2.6s ease-in-out infinite",
        "blood-pulse": "blood-pulse 1.2s ease-in-out infinite",
        scan: "scan 8s linear infinite",
        glitch: "glitch 1.8s steps(2, end) infinite",
        "trail-flow": "trail-flow 1.8s linear infinite",
        "grid-drift": "grid-drift 16s linear infinite",
        "badge-pop": "badge-pop 0.25s ease-out",
        heartbeat: "heartbeat 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
