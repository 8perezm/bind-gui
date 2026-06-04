/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./app/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#FFFFFF",
                foreground: "#000000",
                muted: "#F5F5F5",
                mutedForeground: "#525252",
                borderLight: "#E5E5E5",
            },
            fontFamily: {
                sans: ['Manrope', 'sans-serif'],
                heading: ['Space Grotesk', 'sans-serif'],
                logo: ['Patua One', 'serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            borderRadius: {
                DEFAULT: "0px",
                lg: "0px",
                md: "0px",
                sm: "0px",
            },
            transitionDuration: {
                INSTANT: "100ms",
            },
        },
    },
    plugins: [],
};
