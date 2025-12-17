// tailwind.config.js
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    theme: {
      extend: {
        colors: {
          romance: '#FF385C', // Vibrant Red/Pink
          friendship: '#00C853', // Vibrant Green
          business: '#2962FF', // Vibrant Blue
          paper: '#FFFFFF', // Clean White
          ink: '#1A1A1A', // Sharp Black
          subtle: '#F3F4F6', // Light Gray for cards
        }
      },
    },
    plugins: [],
  }
