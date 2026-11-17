import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        ct: { orange: "#FFB000", green: "#B5D715", purple: "#7E1C9F", ink: "#10142a", bg: "#05060a" },
        tower: { ai: "#C53DFF", cy: "#3A8BFF", cl: "#00C8FF" },
      },
    },
  },
  plugins: [],
} satisfies Config;
