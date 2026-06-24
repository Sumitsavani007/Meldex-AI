import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#05070d",
        panel: "#0c111d",
        line: "#1d2638",
        mint: "#63f2be",
        iris: "#9aa4ff",
        ember: "#ffb86b",
        cyan: "#56d9ff",
        rose: "#ff6b8b"
      },
      boxShadow: {
        glow: "0 0 80px rgba(99, 242, 190, 0.16)",
        aurora: "0 0 120px rgba(154, 164, 255, 0.24)"
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
