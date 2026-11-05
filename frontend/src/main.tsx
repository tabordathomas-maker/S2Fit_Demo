import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { wakeServer } from "./services/api";
import { loadPublicSettings } from "./services/settings";

// El número de WhatsApp lo administra el panel; se consulta sin bloquear la carga.
void loadPublicSettings();
// Despierta la API (Render se duerme a los 15 min) sin bloquear la interfaz.
wakeServer();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
