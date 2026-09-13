/** Cache — design tokens. Esportati da Claude Design, adattati per Hono JSX.
 *  Tema scuro: class="dark" su <html>. */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    fontFamily: {
      display: ['Gabarito', 'system-ui', 'sans-serif'], // titoli, numeri, etichette
      body: ['Karla', 'system-ui', 'sans-serif'],       // liste, corpo, campi
      mono: ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
    },
    extend: {
      colors: {
        paper:  { DEFAULT: '#F4EFE6', band: '#EBE4D6', field: '#FBF8F2' },
        ink:    { DEFAULT: '#1F1B16', 60: 'rgba(31,27,22,.6)', 50: 'rgba(31,27,22,.5)', 35: 'rgba(31,27,22,.35)', 28: 'rgba(31,27,22,.28)', 18: 'rgba(31,27,22,.18)', 12: 'rgba(31,27,22,.12)' },
        olive:  { DEFAULT: '#5C6B2A', deep: '#3F4B1C', tint: '#E1E5CB', light: '#A9B86A' },
        senape: { DEFAULT: '#C9962B', ink: '#6E4F0C', tint: '#F3E4B8' },   // sotto soglia
        terra:  { DEFAULT: '#C4643A', ink: '#8A3E1C', tint: '#F4D9C9' },   // in scadenza
        mattone:{ DEFAULT: '#9E3223', tint: '#F0CFC7' },                   // scaduto
        cenere: '#A79F92',                                                 // azzerato
        dark:   { bg: '#1B1915', band: '#26221C', cell: '#2A261F', text: '#EDE6D8',
                  line: 'rgba(237,230,216,.16)', line30: 'rgba(237,230,216,.3)', muted: 'rgba(237,230,216,.5)',
                  field: '#26221C', senape: '#F0D27A', senapeBg: '#4A3A12', terra: '#F2B79A', terraBg: '#4E2A1A' },
      },
      fontSize: {
        label: ['12px', { lineHeight: '1', letterSpacing: '.08em', fontWeight: '700' }],
        badge: ['11px', { lineHeight: '1', letterSpacing: '.04em', fontWeight: '700' }],
        row:   ['17px', { lineHeight: '1.3' }],
        qty:   ['22px', { lineHeight: '1', fontWeight: '600' }],
        title: ['30px', { lineHeight: '1', letterSpacing: '-.02em', fontWeight: '800' }],
        total: ['52px', { lineHeight: '1', letterSpacing: '-.02em', fontWeight: '700' }],
      },
      spacing: { row: '52px', tap: '44px', cta: '56px', band: '30px', nav: '78px' },
      borderRadius: { DEFAULT: '4px', md: '6px', lg: '8px', sheet: '16px' },
      borderWidth: { 1.5: '1.5px', 3: '3px' },
      keyframes: {
        flash:   { '0%,12%': { background: '#5C6B2A', color: '#F4EFE6' }, '26%,100%': { background: 'transparent', color: 'inherit' } },
        shimmer: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '200px 0' } },
        bar:     { '0%': { width: '0' }, '100%': { width: '70%' } },
        risein:  { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
      },
      animation: {
        flash: 'flash .55s ease-out 1',
        shimmer: 'shimmer 1.1s linear infinite',
        bar: 'bar 1.2s ease-out infinite',
        risein: 'risein .18s ease-out 1',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) { addUtilities({ '.tnum': { fontVariantNumeric: 'tabular-nums' } }); },
  ],
};
