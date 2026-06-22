import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: '/porra-app/',
  plugins: [
    legacy({
      targets: ['defaults', 'safari >= 12', 'ios_saf >= 12']
    })
  ]
});
