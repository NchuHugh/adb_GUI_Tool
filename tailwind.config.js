/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'app-bg': '#0f172a',
        'sidebar-bg': '#1e293b',
        'card-bg': '#1e293b',
        'card-hover': '#334155',
        'primary': '#3b82f6',
        'success': '#22c55e',
        'error': '#ef4444',
        'warning': '#f59e0b',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
        'divider': '#334155',
      },
      fontFamily: {
        mono: ["'Cascadia Code'", "'Consolas'", "'Courier New'", 'monospace'],
      },
      fontSize: {
        base: '14px',
      },
    },
  },
  plugins: [],
}
