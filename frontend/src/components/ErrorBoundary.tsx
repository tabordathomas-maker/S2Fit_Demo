import { Component, type ErrorInfo, type ReactNode } from "react";

/** Evita la pantalla en blanco si un componente falla de forma inesperada. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de interfaz", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="wrap py-16">
        <div className="card flex flex-col items-start gap-4">
          <h1 className="text-3xl">Algo salió mal</h1>
          <p className="muted">Recarga la página para intentarlo de nuevo.</p>
          <button type="button" className="font-bold text-burgundy underline" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
