import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#020204",
        panel: "#0b0b0f",
        line: "#24242b",
        mint: "#2563eb",
        iris: "#4f46e5",
        ember: "#64748b",
        cyan: "#0ea5e9",
        rose: "#dc2626"
      },
      boxShadow: {
        glow: "0 18px 60px rgba(37, 99, 235, 0.12)",
        aurora: "0 24px 80px rgba(15, 23, 42, 0.14)"
      },
      animation: {
        "particle-drift": "particle-drift 18s ease-in-out infinite alternate",
        "aurora-flow": "aurora-flow 16s ease-in-out infinite alternate",
        "neural-pulse": "neural-pulse 3s ease-in-out infinite"
      },
      keyframes: {
        "particle-drift": {
          "0%": { transform: "translate3d(-2%, 1%, 0) scale(1)" },
          "100%": { transform: "translate3d(3%, -2%, 0) scale(1.05)" }
        },
        "aurora-flow": {
          "0%": { transform: "translateX(-4%) rotate(0deg)", opacity: "0.65" },
          "100%": { transform: "translateX(4%) rotate(2deg)", opacity: "0.95" }
        },
        "neural-pulse": {
          "0%, 100%": { opacity: "0.42" },
          "50%": { opacity: "0.9" }
        }
      }
    }
  },
  plugins: [forms]
};

export default config;
