/** @type {import('tailwindcss').Config} */

// Build a 50–900 scale that resolves to the CSS custom properties defined in
// src/index.css, so the :root tokens stay the single source of truth.
const scale = (name) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [
      step,
      `hsl(var(--${name}-${step}) / <alpha-value>)`,
    ]),
  );

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: scale("primary"),
        grey: scale("grey"),
        green: scale("green"),
        yellow: scale("yellow"),
        red: scale("red"),
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
        mono: ['"IBM Plex Mono"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
