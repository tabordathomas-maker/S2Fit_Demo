import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { retryPolicy } from "../services/retryPolicy";

// Sin esperas entre reintentos para no alargar las pruebas; las pruebas de reintento fijan sus propios tiempos.
beforeEach(() => {
  retryPolicy.delaysMs = [];
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

// jsdom no implementa scrollTo (lo usa Layout al cambiar de ruta).
Object.defineProperty(window, "scrollTo", { value: () => {}, writable: true });
