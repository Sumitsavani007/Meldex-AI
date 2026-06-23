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
        ember: "#ffb86b"
      },
      boxShadow: {
        glow: "0 0 80px rgba(99, 242, 190, 0.16)"
      }
    }
  },
  plugins: [forms]
};

export default config;
