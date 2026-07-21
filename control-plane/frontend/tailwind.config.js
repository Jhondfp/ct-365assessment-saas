/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#c94d16',
          secondary: '#6b3fa0',
        }
      }
    },
  },
  plugins: [],
  darkMode: 'class'
}
