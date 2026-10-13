/**
 * Familee - PostCSS
 *
 * Tailwind CSS 4 is plugged in as a single plugin; a separate
 * tailwind.config.js is not needed any more, the whole setup lives in CSS
 * (src/app/globals.css).
 */

const config = {
    plugins: ["@tailwindcss/postcss"],
};

export default config;
