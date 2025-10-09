import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";
import tailwindcss from "@tailwindcss/vite";

// IMPORTANT: ChatGPT widgets require a publicly accessible HTTPS URL
// Localhost is NOT supported - use a tunneling service or deploy to a real domain
// Development: Use ngrok, cloudflared tunnel, or vite-plugin-cloudflare-tunnel
// Production: Use your actual deployed URL (e.g., https://your-domain.com)
const HOST_URL = process.env.HOST_URL || (() => {
  throw new Error("HOST_URL environment variable is required. Use a tunneling service (ngrok/cloudflared) or deployed URL.");
})();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devServer({
      entry: "src/server/index.ts",
      exclude: [/.*\.tsx?$/, /.*\.(s?css|less)$/, /public\/.*/],
    }),
  ],
  base: `${HOST_URL}/`,
  define: {
    "import.meta.env.HOST_URL": JSON.stringify(HOST_URL),
  },
});
