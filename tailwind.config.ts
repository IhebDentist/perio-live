import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Deep navy for headings
        navy: '#12294B',
        // Muted teal/sage green for interactive elements
        teal: {
          50: '#F0F7F6',
          100: '#D1E5E2',
          200: '#A8CBC6',
          300: '#7FB0A9',
          400: '#5F9C93',
          500: '#4CA69B',   // primary sage
          600: '#3D8B81',   // darker hover
          700: '#2F6F67',
          800: '#23534D',
          900: '#183833',
        },
        // Soft light-blue background
        lightBlue: '#EAF2F8',
        // Soft aqua accent (optional)
        aqua: '#D4E9F2',
        // Lavender accent
        lavender: '#E6E6FA',
      },
    },
  },
  plugins: [],
};

export default config;