import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Ren klientapp: inga serverfunktioner, ingen databas. Bygget i dist/ kan
// läggas på vilken statisk värd som helst (GitHub Pages, Netlify, Vercel, en
// vanlig webbserver). Sätt base om appen inte ligger på domänens rot.
export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: { port: 5173 },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
