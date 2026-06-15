/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        night: {
          50: '#e8e8ff', 100: '#c4c4f0', 200: '#9090d6', 300: '#6060b8',
          400: '#3b3b9a', 500: '#1a1a7e', 600: '#111160', 700: '#0b0b42',
          800: '#07072e', 900: '#04041e', 950: '#02020f',
        },
      },
      boxShadow: {
        'blue-glow': '0 0 20px rgba(59,130,246,0.35), 0 0 50px rgba(59,130,246,0.1)',
        'blue-glow-lg': '0 0 40px rgba(59,130,246,0.5), 0 0 100px rgba(59,130,246,0.15)',
        'card': '0 4px 32px rgba(0,0,0,0.55), 0 0 50px rgba(59,130,246,0.04)',
        'card-hover': '0 0 30px rgba(59,130,246,0.1), 0 0 80px rgba(59,130,246,0.035), 0 8px 40px rgba(0,0,0,0.6)',
      },
      animation: {
        'fade-up': 'fadeInUp 0.3s ease-out both',
        'fade': 'fadeIn 0.2s ease-out both',
        'glow': 'pulseGlow 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
