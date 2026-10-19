import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      ink: 'var(--color-ink)',
      paper: 'var(--color-paper)',
      surface: 'var(--color-surface)',
      line: 'var(--color-line)',
      cmr: 'var(--color-cmr)',
      saving: 'var(--color-saving)',
      warn: 'var(--color-warn)',
      muted: 'var(--color-muted)',
      primary: 'var(--color-primary)',
      'primary-hover': 'var(--color-primary-hover)',
      button: 'var(--color-button)',
      'button-hover': 'var(--color-button-hover)',
      header: 'var(--color-header)',
    },
    fontFamily: {
      sans: ['var(--font-sans)'],
    },
    fontSize: {
      xs: ['12px', { lineHeight: '1.5' }],
      sm: ['14px', { lineHeight: '1.5' }],
      base: ['16px', { lineHeight: '1.5' }],
      lg: ['20px', { lineHeight: '1.4' }],
      '2xl': ['28px', { lineHeight: '1.2' }],
      '4xl': ['40px', { lineHeight: '1.1' }],
    },
    extend: {
      borderRadius: {
        tag: '2px',
        button: '10px',
        sheet: '14px',
      },
      boxShadow: {
        sheet: 'var(--shadow-sheet)',
      },
    },
  },
  plugins: [],
} satisfies Config;