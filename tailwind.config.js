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
        // Read from CSS variables (index.css) so the Counter screen can use its cyan/teal accents
        // on the shared panels and dialogs. Classic View keeps exactly these defaults.
        brand: {
          primary: 'rgb(var(--brand-primary, 79 70 229) / <alpha-value>)', // indigo-600
          'primary-hover': 'rgb(var(--brand-primary-hover, 67 56 202) / <alpha-value>)', // indigo-700
          secondary: 'rgb(var(--brand-secondary, 217 70 239) / <alpha-value>)', // fuchsia-500
          'secondary-hover': 'rgb(var(--brand-secondary-hover, 192 38 211) / <alpha-value>)', // fuchsia-600
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
