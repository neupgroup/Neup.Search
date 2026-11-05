import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './@neup/components/**/*.{js,ts,jsx,tsx,mdx}',
    './@neup/core/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './services/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      screens: {
        lg: '1024px',
        xl: '1280px',
        '2xl': '1440px',
      },
    },
    extend: {
      fontFamily: {
        body: ['var(--font-outfit)'],
        headline: ['var(--font-outfit)'],
        sans: ['var(--font-outfit)'],
        code: ['var(--font-jetbrains-mono)'],
      },
      colors: {
        background: 'rgb(from var(--background) r g b / <alpha-value>)',
        foreground: 'rgb(from var(--foreground) r g b / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(from var(--card) r g b / <alpha-value>)',
          foreground: 'rgb(from var(--card-foreground) r g b / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(from var(--popover) r g b / <alpha-value>)',
          foreground: 'rgb(from var(--popover-foreground) r g b / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'rgb(from var(--primary-foreground) r g b / <alpha-value>)',
          900: 'rgb(from var(--primary-900) r g b / <alpha-value>)',
          950: 'rgb(from var(--primary-950) r g b / <alpha-value>)',
          1000: 'rgb(from var(--primary-1000) r g b / <alpha-value>)',
          hover: 'var(--primary-hover)',
          press: 'var(--primary-press)',
          active: 'var(--primary-active)',
          'active-hover': 'var(--primary-active-hover)',
          'active-press': 'var(--primary-active-press)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(from var(--secondary-foreground) r g b / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(from var(--muted) r g b / <alpha-value>)',
          foreground: 'rgb(from var(--muted-foreground) r g b / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(from var(--accent) r g b / <alpha-value>)',
          foreground: 'rgb(from var(--accent-foreground) r g b / <alpha-value>)',
        },
        interaction: {
          hover: 'var(--interaction-hover)',
          press: 'var(--interaction-press)',
          active: 'var(--interaction-active)',
          'active-hover': 'var(--interaction-active-hover)',
          'active-press': 'var(--interaction-active-press)',
        },
        destructive: {
          DEFAULT: 'rgb(from var(--destructive) r g b / <alpha-value>)',
          foreground: 'rgb(from var(--destructive-foreground) r g b / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(from var(--destructive) r g b / <alpha-value>)',
          foreground: 'rgb(from var(--destructive-foreground) r g b / <alpha-value>)',
          hover: 'color-mix(in srgb, var(--destructive) 90%, black)',
          press: 'color-mix(in srgb, var(--destructive) 78%, black)',
        },
        border: 'rgb(from var(--border) r g b / <alpha-value>)',
        input: 'rgb(from var(--input) r g b / <alpha-value>)',
        ring: 'rgb(from var(--ring) r g b / <alpha-value>)',
        chart: {
          '1': 'hsl(var(--chart-1) / <alpha-value>)',
          '2': 'hsl(var(--chart-2) / <alpha-value>)',
          '3': 'hsl(var(--chart-3) / <alpha-value>)',
          '4': 'hsl(var(--chart-4) / <alpha-value>)',
          '5': 'hsl(var(--chart-5) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'rgb(from var(--sidebar-background) r g b / <alpha-value>)',
          foreground: 'rgb(from var(--sidebar-foreground) r g b / <alpha-value>)',
          primary: 'rgb(from var(--sidebar-primary) r g b / <alpha-value>)',
          'primary-foreground': 'rgb(from var(--sidebar-primary-foreground) r g b / <alpha-value>)',
          accent: 'rgb(from var(--sidebar-accent) r g b / <alpha-value>)',
          'accent-foreground': 'rgb(from var(--sidebar-accent-foreground) r g b / <alpha-value>)',
          border: 'rgb(from var(--sidebar-border) r g b / <alpha-value>)',
          ring: 'rgb(from var(--sidebar-ring) r g b / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        'collapsible-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-collapsible-content-height)',
          },
        },
        'collapsible-up': {
          from: {
            height: 'var(--radix-collapsible-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.25s ease-out',
        'collapsible-up': 'collapsible-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
