import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0e1a",
          elev: "#131829",
          card: "#1a1f2e",
          hover: "#222840",
        },
        accent: {
          DEFAULT: "#fbbf24",
          dim: "#f59e0b",
          subtle: "#fcd34d",
        },
        line: "#252a3d",
        ink: {
          DEFAULT: "#f5f5f7",
          mute: "#9aa3ad",
          dim: "#6b7280",
        },
        stage: {
          new: "#3b82f6",
          underwriting: "#a855f7",
          approved: "#22c55e",
          delivered: "#10b981",
          lapsed: "#ef4444",
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
    },
  },
  plugins: [],
};

export default config;
