import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Các domain được phép truy cập explorer (qua reverse proxy / domain tuỳ chỉnh).
// Thêm host mới vào mảng này trong tương lai.
const allowedHosts = [
  'explorer.solaris.trade',
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    allowedHosts,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    port: 5174,
    allowedHosts,
  },
});
