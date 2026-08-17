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
      /*
       * Type scale. The app had invented 241 one-off `text-[Npx]` classes across
       * 37 files — six different sizes between 10px and 16px, none of them
       * enumerable or greppable. These are those sizes, named, with line-heights
       * that actually pair with them. `2xs` is one step under `xs`, `2sm` one
       * step under `sm`; `xs`, `sm` and up keep Tailwind's defaults.
       *
       * Nothing outside this scale should appear in a className. If a new size
       * seems necessary, add it here so it is shared.
       */
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px — micro labels, counters
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], //    11px — metadata, captions
        xs: ['0.75rem', { lineHeight: '1rem' }], //          12px
        '2sm': ['0.8125rem', { lineHeight: '1.125rem' }], // 13px — dense rows, nav, tabs
        // Editorial display sizes for the serif page heroes. Line-height and
        // tracking are baked in, so a hero is one class instead of three.
        // Collapsed from five hand-written sizes (28/30/34/36/44) to three.
        'display-sm': ['1.875rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }], //  30px
        'display-md': ['2.25rem', { lineHeight: '1.08', letterSpacing: '-0.025em' }], //  36px
        'display-lg': ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }], //  44px
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        serif: ['Source Serif 4', 'Source Serif Pro', 'Georgia', 'serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
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
        rust: {
          DEFAULT: 'hsl(var(--rust))',
          soft: 'hsl(var(--rust-soft))',
          text: 'hsl(var(--rust-text))',
          /* For the theme-invariant ink surface — see `ink` / `parchment`. */
          'on-ink': 'hsl(var(--rust-on-ink))',
        },
        claude: {
          DEFAULT: 'hsl(var(--claude))',
          soft: 'hsl(var(--claude-soft))',
        },
        /* Star ratings. Semantically data, not a status — kept out of warning. */
        rating: 'hsl(var(--rating))',
        /* Theme-invariant. For surfaces painted a fixed brand colour (the login
           showcase panel, brand wordmarks) that must not flip with the theme. */
        ink: 'hsl(var(--ink))',
        parchment: 'hsl(var(--parchment))',
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
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
        // Editorial fade-up — used on /pricing for staggered section reveals.
        // Translates from 8px below to rest, fades opacity 0 → 1.
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'fade-up': 'fade-up 700ms ease-out both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
