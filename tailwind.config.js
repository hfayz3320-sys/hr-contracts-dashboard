/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tealbrand: {
          50: '#eef9f8',
          100: '#d5f0ed',
          200: '#aee0d9',
          300: '#7cc9bf',
          400: '#4fb0a6',
          500: '#2f968d',
          600: '#247770',
          700: '#1f5f5a',
          800: '#1d4c48',
          900: '#1a403d'
        }
      },
      boxShadow: {
        soft: '0 8px 24px rgba(10, 30, 35, 0.08)',
        panel: '0 10px 30px rgba(18, 65, 78, 0.12)',
      },
      borderRadius: {
        xl2: '18px',
      },
      fontFamily: {
        arabic: ['Cairo', 'Tajawal', 'sans-serif'],
        english: ['Inter', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
