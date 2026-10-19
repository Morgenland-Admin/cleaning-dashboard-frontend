/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      // Type scale: nothing outside it in a className (`pnpm run check:tokens` enforces it).
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }], // counters only
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1rem' }],
        '2sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }], // mobile inputs: iOS zooms anything smaller
        title: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.012em' }], // page h1
        metric: ['1.625rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }], // KPI value
      },
      fontFamily: {
        sans: [
          'IBM Plex Sans Variable',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        border: 'hsl(var(--border))',
        'border-strong': 'hsl(var(--border-strong))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
          'on-ink': 'hsl(var(--primary-on-ink))',
        },
        highlight: {
          DEFAULT: 'hsl(var(--highlight))',
          foreground: 'hsl(var(--highlight-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          soft: 'hsl(var(--destructive-soft))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        claude: {
          DEFAULT: 'hsl(var(--claude))',
          soft: 'hsl(var(--claude-soft))',
        },
        // Star ratings are data, not a status: keep out of warning.
        rating: 'hsl(var(--rating))',
        // Theme-invariant: fixed-colour surfaces (login panel, brand wordmarks) must not flip with the theme.
        ink: 'hsl(var(--ink))',
        parchment: 'hsl(var(--parchment))',
        overlay: 'hsl(var(--overlay))',
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft: 'hsl(var(--warning-soft))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          soft: 'hsl(var(--info-soft))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          active: 'hsl(var(--sidebar-active))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      // `bg-primary` is the ink fill, but `text-primary`, `border-primary` and `ring-primary` resolve to rust.
      textColor: {
        primary: {
          DEFAULT: 'hsl(var(--primary-text))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
          'on-ink': 'hsl(var(--primary-on-ink))',
        },
      },
      borderColor: {
        primary: {
          DEFAULT: 'hsl(var(--highlight))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
        },
      },
      ringColor: {
        primary: {
          DEFAULT: 'hsl(var(--highlight))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
        },
      },
      // The smaller the thing, the tighter the corner; nothing rounder than 2xl except `full`.
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 2px)',
        '2xl': 'calc(var(--radius) + 4px)',
      },
      // Panels are separated by border, not shadow; shadows are for floating things (chip, menu, dialog).
      boxShadow: {
        xs: '0 1px 0 0 hsl(var(--shadow) / 0.04)',
        sm: '0 1px 2px 0 hsl(var(--shadow) / 0.06)',
        DEFAULT: '0 1px 3px 0 hsl(var(--shadow) / 0.08), 0 1px 2px -1px hsl(var(--shadow) / 0.06)',
        md: '0 6px 16px -4px hsl(var(--shadow) / 0.12), 0 2px 4px -2px hsl(var(--shadow) / 0.06)',
        lg: '0 16px 40px -8px hsl(var(--shadow) / 0.20), 0 4px 10px -4px hsl(var(--shadow) / 0.08)',
        xl: '0 24px 56px -12px hsl(var(--shadow) / 0.28)',
      },
      // Radix content uses z-50; anything that must sit above a dialog is a toast.
      zIndex: {
        header: '30',
        overlay: '50',
        toast: '100',
      },
      transitionDuration: {
        DEFAULT: '120ms',
        fast: '120ms',
        base: '180ms',
        slow: '260ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
