/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        chrome: {
          grey: '#5f6368',
          blue: '#1a73e8',
          red: '#d93025',
          yellow: '#f9ab00',
          green: '#188038',
          pink: '#d01884',
          purple: '#a142f4',
          cyan: '#007b83',
          orange: '#e8710a',
        },
      },
      width: {
        sidebar: '220px',
        property: '280px',
      },
    },
  },
  plugins: [],
};
