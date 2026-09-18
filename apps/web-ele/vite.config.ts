import { defineConfig, viteCssLayerPlugin } from '@vben/vite-config';

import ElementPlus from 'unplugin-element-plus/vite';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      plugins: [
        // element-plus 的 css 包进 @layer el，使 Tailwind 工具类可覆盖组件样式
        viteCssLayerPlugin({ layerName: 'el', packageName: 'element-plus' }),
        ElementPlus({ format: 'esm' }),
      ],
      server: {
        host: '127.0.0.1',
        strictPort: true,
        proxy: {
          '/admin-api': {
            changeOrigin: true,
            // mock代理目标地址
            target: 'http://127.0.0.1:8000',
            ws: true,
          },
        },
      },
    },
  };
});
