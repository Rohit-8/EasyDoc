/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#09090b',
          1: '#0f0f12',
          2: '#18181b',
          3: '#1f1f23',
          4: '#27272a',
        },
        border: {
          DEFAULT: '#27272a',
          subtle: '#1f1f23',
          hover: '#3f3f46',
        },
        accent: {
          DEFAULT: '#a78bfa',
          hover: '#c4b5fd',
          muted: 'rgba(167, 139, 250, 0.1)',
          subtle: 'rgba(167, 139, 250, 0.06)',
        },
        text: {
          primary: '#fafafa',
          secondary: '#a1a1aa',
          tertiary: '#71717a',
          inverse: '#09090b',
        },
        status: {
          success: '#34d399',
          warning: '#fbbf24',
          error: '#f87171',
          info: '#60a5fa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(167, 139, 250, 0.15)',
        'elevated': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'subtle': '0 1px 2px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};
