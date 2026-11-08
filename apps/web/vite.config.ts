import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// 開発時に /api を転送する先。API の開発サーバーの既定のポートに合わせる
const apiUrl = process.env.API_URL ?? "http://localhost:8080";

/**
 * 開発サーバーの接続を、使われないまま切るまでの時間を延ばす(Node.js の既定は5秒)。
 * 切る瞬間にブラウザーが同じ接続で POST を送ると、Playwright の WebKit は本文を送り直せずに失敗するため。
 * 本番は Cloud Run が受けるため、開発サーバーだけの設定
 */
const keepAlive = (): Plugin => ({
  name: "nippo-keep-alive",
  configureServer(server) {
    if (server.httpServer && "keepAliveTimeout" in server.httpServer) {
      server.httpServer.keepAliveTimeout = 60_000;
      server.httpServer.headersTimeout = 65_000;
    }
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), keepAlive()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": apiUrl,
    },
  },
});
