import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@career-copilot/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@career-copilot/api': path.resolve(__dirname, '../api/src/index.ts'),
      '@career-copilot/ui': path.resolve(__dirname, '../ui/src/index.ts'),
      '@career-copilot/feature-profile': path.resolve(__dirname, '../feature-profile/src/index.ts'),
      '@career-copilot/feature-jobs': path.resolve(__dirname, '../feature-jobs/src/index.ts'),
      '@career-copilot/feature-resume-studio': path.resolve(__dirname, '../feature-resume-studio/src/index.ts'),
      '@career-copilot/feature-applications': path.resolve(__dirname, '../feature-applications/src/index.ts'),
      '@career-copilot/feature-interviews': path.resolve(__dirname, '../feature-interviews/src/index.ts'),
      '@career-copilot/feature-insights': path.resolve(__dirname, '../feature-insights/src/index.ts'),
      '@career-copilot/feature-settings': path.resolve(__dirname, '../feature-settings/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
