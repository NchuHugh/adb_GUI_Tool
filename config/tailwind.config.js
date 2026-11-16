/** @type {import('tailwindcss').Config} */
module.exports = {
  content: {
    relative: true,
    files: ['../index.html', '../src/**/*.{js,ts,jsx,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        slate: Object.fromEntries([200, 300, 400, 500, 600, 700, 800, 900, 950].map(
          shade => [shade, `rgb(var(--slate-${shade}) / <alpha-value>)`],
        )),
        'app-bg': 'rgb(var(--slate-900) / <alpha-value>)',
        'sidebar-bg': 'rgb(var(--slate-800) / <alpha-value>)',
        'card-bg': 'rgb(var(--slate-800) / <alpha-value>)',
        'card-hover': 'rgb(var(--slate-700) / <alpha-value>)',
        'primary': 'rgb(var(--accent) / <alpha-value>)',
        'success': 'rgb(var(--success) / <alpha-value>)',
        'error': 'rgb(var(--error) / <alpha-value>)',
        'warning': 'rgb(var(--warning) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--slate-400) / <alpha-value>)',
        'divider': 'rgb(var(--slate-700) / <alpha-value>)',
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
