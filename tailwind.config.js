/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Option B – Modern Athletic / Red Accent
        bg: '#0D1117', // Deep dark blue-grey canvas (--bg-app)
        surface: '#161B22', // Elevated card surface (--bg-card)
        input: '#0D1117', // Recessed input background (--bg-input)
        surface2: '#191D23', // ~white/5 over canvas: ghost/stepper/chip
        line: 'rgba(255,255,255,0.08)', // Subtle border (--border-subtle)
        brand: '#FF3B30', // Active Red (--accent-primary)
        brandDark: '#D73229', // Darker red hover/active (--accent-hover)
        success: '#30D158', // Completed sets (--status-success)
        ink: '#E6EDF3', // High-contrast text (--text-primary)
        muted: '#8B949E', // Labels / units (--text-secondary)
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
