import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "../..",
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173)
  }
});
