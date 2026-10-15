// Tailwind build configuration. Ported from the inline `tailwind.config` that index.html used to
// hand to the Tailwind Play CDN script, so the generated styles match what the CDN produced.
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  // Supplier colours are stored as data (`Supplier.color`, e.g. "bg-red-800") and applied with
  // `${supplier.color}`. The built-in suppliers and the colour picker are scanned from source, but
  // a supplier restored from a backup or created before a palette change may carry any Tailwind
  // background colour, so every palette background is kept. The CDN generated these on demand.
  safelist: [
    {
      pattern:
        /^bg-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/,
    },
  ],
  theme: {
    extend: {
      fontFamily: {
        // Same stack as the CDN config. Inter is now bundled locally; characters Inter does not
        // cover (Arabic) fall back to the device's sans-serif font exactly as before.
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#4f46e5', // indigo-600
          'primary-hover': '#4338ca', // indigo-700
          secondary: '#d946ef', // fuchsia-500
          'secondary-hover': '#c026d3', // fuchsia-600
          muted: '#64748b', // slate-500
        },
      },
      scale: {
        98: '.98',
      },
    },
  },
  plugins: [],
};
