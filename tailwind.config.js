/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4f6ef7',
        secondary: '#00b4b4',
        danger: '#e84040',
        success: '#22c55e',
        surface: '#ffffff',
        background: '#f5f7fa',
        'text-primary': '#1a1f2e',
        'text-muted': '#6b7280',
        border: '#e5e7eb',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        input: '8px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
