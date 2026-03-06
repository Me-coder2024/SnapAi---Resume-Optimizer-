/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                base: '#09090B',
                surface: {
                    1: '#111113',
                    2: '#1A1A1F',
                    3: '#222228',
                },
                edge: {
                    subtle: '#1C1C22',
                    DEFAULT: '#27272F',
                    hover: '#33333D',
                    active: '#3F3F4A',
                },
                content: {
                    primary: '#EDEDEF',
                    secondary: '#A1A1A9',
                    tertiary: '#63636E',
                    disabled: '#3A3A44',
                },
                accent: {
                    DEFAULT: '#3B82F6',
                    hover: '#2563EB',
                    muted: 'rgba(59, 130, 246, 0.08)',
                    border: 'rgba(59, 130, 246, 0.19)',
                },
                success: { DEFAULT: '#22C55E', muted: 'rgba(34, 197, 94, 0.08)' },
                warning: { DEFAULT: '#EAB308', muted: 'rgba(234, 179, 8, 0.08)' },
                error: { DEFAULT: '#EF4444', muted: 'rgba(239, 68, 68, 0.08)' },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
            },
            fontSize: {
                'hero': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '600' }],
                'title': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
                'heading': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '500' }],
                'body': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
                'small': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
                'micro': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.05em', fontWeight: '500' }],
            },
            borderRadius: {
                'sm': '4px',
                'md': '6px',
                'lg': '8px',
                'xl': '12px',
            },
            spacing: {
                '18': '4.5rem',
                '22': '5.5rem',
                '30': '7.5rem',
            },
            boxShadow: {
                'subtle': '0 1px 2px rgba(0, 0, 0, 0.3)',
                'card': '0 2px 8px rgba(0, 0, 0, 0.2)',
                'elevated': '0 8px 24px rgba(0, 0, 0, 0.3)',
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
            },
            keyframes: {
                fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
                slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
            },
        },
    },
    plugins: [],
}
