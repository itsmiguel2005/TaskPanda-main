/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f1fb",
          300: "#2bfbf5",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e60",
        },
        accent: {
          50: "#eef6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
      },
      backgroundImage: {
        "hero-gradient":
          "linear-gradient(135deg, #0f766e 0%, #075985 50%, #3730a8 100%)",
      },
    },
  },
  plugins: [],
}
