import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the Tailwind config relative to this file so it also works when the
// EcoAI server runs Vite from another working directory.
const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(here, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
