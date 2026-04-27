import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // CommissionIQ-inspired dark palette
        bg: {
          base: "#0a0a0c",
          panel: "#111114",
          card: "#16161b",
          hover: "#1c1c22",
          border: "#23232b"
        },
        ink: {
          primary: "#f5f5f7",
          secondary: "#9ca3af",
          muted: "#6b7280",
          dim: "#4b5563"
        },
        gold: {
          DEFAULT: "#facc15",
          dim: "#eab308",
          glow: "#fde047"
        },
        brand: {
          blue: "#2563eb",
          blueHover: "#1d4ed8",
          blueLight: "#3b82f6"
        },
        status: {
          green: "#22c55e",
          greenBg: "rgba(34,197,94,0.12)",
          yellow: "#eab308",
          yellowBg: "rgba(234,179,8,0.12)",
          red: "#ef4444",
          redBg: "rgba(239,68,68,0.12)",
          blue: "#3b82f6",
          blueBg: "rgba(59,130,246,0.12)",
          gray: "#6b7280",
          grayBg: "rgba(107,114,128,0.12)"
        }
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
