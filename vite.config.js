import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// وضعان للبناء:
//   npm run build         → مجلد dist/ للنشر على أي استضافة ويب
//   npm run build:single  → ملف HTML واحد في dist-single/ يعمل بالنقر المزدوج دون خادم أو إنترنت
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile({ removeViteModuleLoader: true })] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
      assetsInlineLimit: single ? 100_000_000 : 4096,
    },
    server: { host: true },
    preview: { host: true },
  };
});
