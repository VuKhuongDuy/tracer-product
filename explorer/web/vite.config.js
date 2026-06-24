import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Các domain được phép truy cập explorer (qua reverse proxy / domain tuỳ chỉnh).
// Thêm host mới vào mảng này trong tương lai.
const allowedHosts = ["explorer.solaris.trade", "47.129.218.19"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    allowedHosts,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5174,
    allowedHosts,
  },
});
