import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  env: {
    CODESPACE_NAME?: string;
  };
};

const codespaceHost = process.env.CODESPACE_NAME
  ? `${process.env.CODESPACE_NAME.toLowerCase()}-5173.app.github.dev`
  : null;

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: codespaceHost ? [codespaceHost] : [],
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
