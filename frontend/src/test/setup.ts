import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

// jsdom no implementa scrollTo (lo usa Layout al cambiar de ruta).
Object.defineProperty(window, "scrollTo", { value: () => {}, writable: true });
