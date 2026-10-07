import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:3000";

  return {
    root: "frontend",
    envDir: "..",
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": apiProxyTarget,
        "/uploads": apiProxyTarget,
      },
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      rollupOptions: {
        input: "./index.html",
      },
    },
  };
});
