import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070708",
          900: "#0b0b0d",
          850: "#101013",
          800: "#15151a",
          700: "#1c1c22",
          600: "#26262e",
          500: "#3a3a44",
          400: "#5a5a66",
          300: "#8c8c98",
          200: "#b8b8c2",
          100: "#e6e6ea",
        },
        accent: {
          DEFAULT: "#e8e8ee",
          dim: "#a8a8b3",
        },
        bull: "#5fd39a",
        bear: "#f06a7a",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      backgroundImage: {
        "radial-wash":
          "radial-gradient(80% 50% at 50% 0%, rgba(120,120,140,0.18) 0%, rgba(0,0,0,0) 70%)",
        "grid-soft":
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-soft": "48px 48px",
      },
      animation: {
        "float-slow": "float 9s ease-in-out infinite",
        "float-med": "float 7s ease-in-out infinite",
        "float-fast": "float 5s ease-in-out infinite",
        "pulse-soft": "pulseSoft 3s ease-in-out infinite",
        "scroll-hint": "scrollHint 2.4s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        scrollHint: {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "50%": { transform: "translateY(6px)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
