/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Ruta base del sitio en GitHub Pages:
//   - Sitio de usuario  (usuario.github.io)               -> VITE_BASE_PATH=/
//   - Sitio de proyecto (usuario.github.io/repositorio/)  -> VITE_BASE_PATH=/repositorio/
// El flujo de GitHub Actions la calcula automáticamente a partir del nombre del repositorio.
function normalizeBase(value: string | undefined): string {
  if (!value || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: normalizeBase(env.VITE_BASE_PATH),
    plugins: [react(), tailwindcss()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
