import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    allowedHosts: true,
  },
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: { "~": path.resolve(__dirname, "./app") },
  },
});
