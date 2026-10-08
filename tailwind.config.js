/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './types/**/*.{ts,tsx}',
  ],
  safelist: [
    { pattern: /^(bg|text|border|ring)-(primary|secondary)(-(dark|light|DEFAULT))?$/ },
    { pattern: /^(bg|text|border)-(success|warning|danger)(-(soft|ink|DEFAULT))?$/ },
    { pattern: /^(bg|text|border)-(red|green|blue|yellow|orange|purple|gray|slate)-(100|200|300|400|500|600|700|800|900)$/ },
    { pattern: /^(bg|text|border)-(red|green|blue|yellow|orange|purple|gray|slate)-(100|200|300|400|500|600|700|800|900)\/(10|20|30|40|50|60|70|80|90)$/ },
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#9D1F15',
          dark: '#7A1810',
          light: '#C43E32',
        },
        secondary: {
          DEFAULT: '#F39C2A',
          dark: '#D6861E',
        },
        success: {
          DEFAULT: '#16a34a',
          soft: '#dcfce7',
          ink: '#14532d',
        },
        warning: {
          DEFAULT: '#d97706',
          soft: '#fef3c7',
          ink: '#78350f',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fee2e2',
          ink: '#7f1d1d',
        },
        'light-bg': '#F8F9FA',
      },
      zIndex: {
        header: '50',
        sidebar: '40',
        modal: '100',
      },
    },
  },
  plugins: [],
};
