/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        hush: {
          primary: '#0b1727',
          accent: '#5dd6c3',
          muted: '#d6dde6'
        }
      }
    }
  },
  plugins: [require('@tailwindcss/forms'), require('flowbite/plugin')]
};
