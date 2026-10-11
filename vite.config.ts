import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Chemins relatifs : le build marche sur GitHub Pages, Netlify ou un simple dossier.
  base: './',
  build: {
    // three.js pèse ≈ 600 Ko (≈ 150 Ko compressés), chargé à part après le contenu.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
