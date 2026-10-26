import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    screens: {
      xs: "360px",
      sm: "480px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1440px",
    },
    extend: {
      colors: {
        ink: "var(--color-ink)",
        graphite: "#252827",
        canvas: "#f5f2ed",
        bordeaux: "#642e35",
        cream: "#f1ede5",
        "surface-hover": "var(--color-surface-hover)",
        "border-strong": "var(--color-border-strong)",
        "text-disabled": "var(--color-text-disabled)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        border: "var(--color-border)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          soft: "var(--color-accent-soft)",
        },
        critical: {
          DEFAULT: "var(--color-critical)",
          bg: "var(--color-critical-bg)",
        },
        important: {
          DEFAULT: "var(--color-important)",
          bg: "var(--color-important-bg)",
        },
        opportunity: {
          DEFAULT: "var(--color-opportunity)",
          bg: "var(--color-opportunity-bg)",
        },
        informative: {
          DEFAULT: "var(--color-informative)",
          bg: "var(--color-informative-bg)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
      },
      borderRadius: {
        sm: "4px",
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        DEFAULT: "8px",
        md: "10px",
        lg: "14px",
      },
      boxShadow: {
        raised: "var(--shadow-raised)",
      },
      maxWidth: {
        cockpit: "1180px",
      },
    },
  },
  plugins: [],
};

export default config;
