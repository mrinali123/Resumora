import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "Consolas", "monospace"],
      },
      colors: {
        // Surface scale
        surface: {
          0: "#0a0a0a",
          1: "#111111",
          2: "#1a1a1a",
          3: "#222222",
          4: "#2a2a2a",
        },
        border: {
          DEFAULT: "#2a2a2a",
          strong: "#3d3d3d",
        },
        // Text
        ink: {
          1: "#f0f0f0",
          2: "#888888",
          3: "#4a4a4a",
        },
        // Accent
        blue: {
          DEFAULT: "#5b8ef0",
          hover: "#7aa4f4",
          dim: "rgba(91,142,240,0.12)",
          border: "rgba(91,142,240,0.25)",
        },
        // Semantic — used exclusively for data/status
        success: {
          DEFAULT: "#3fb950",
          dim: "rgba(63,185,80,0.1)",
          border: "rgba(63,185,80,0.2)",
        },
        warning: {
          DEFAULT: "#d29922",
          dim: "rgba(210,153,34,0.1)",
          border: "rgba(210,153,34,0.2)",
        },
        danger: {
          DEFAULT: "#f85149",
          dim: "rgba(248,81,73,0.1)",
          border: "rgba(248,81,73,0.2)",
        },
      },
      fontSize: {
        "2xs": ["10px", "14px"],
        xs:    ["11px", "16px"],
        sm:    ["13px", "20px"],
        base:  ["14px", "22px"],
        lg:    ["16px", "24px"],
        xl:    ["18px", "26px"],
        "2xl": ["22px", "30px"],
        "3xl": ["28px", "36px"],
        "4xl": ["36px", "44px"],
        "5xl": ["48px", "56px"],
      },
      letterSpacing: {
        tighter: "-0.03em",
        tight: "-0.02em",
        normal: "-0.01em",
        wide: "0.02em",
        wider: "0.04em",
        widest: "0.08em",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)",
        dropdown: "0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        focus: "0 0 0 2px rgba(91,142,240,0.4)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease forwards",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "count-up": "countUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        countUp: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
