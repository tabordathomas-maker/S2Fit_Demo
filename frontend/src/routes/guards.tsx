import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Alert, Spinner } from "../components/ui";
import { useAuth } from "../features/auth/AuthProvider";

/** Redirige a /ingresar conservando la ruta de regreso. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="wrap"><Spinner /></div>;
  if (!session) {
    return <Navigate to={`/ingresar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <>{children}</>;
}

/** Oculta la interfaz de administración. La protección real está en el backend. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, profile } = useAuth();
  return (
    <RequireAuth>
      {isAdmin ? (
        children
      ) : profile ? (
        <div className="wrap py-16">
          <Alert>Esta sección es solo para administración.</Alert>
        </div>
      ) : (
        <div className="wrap"><Spinner /></div>
      )}
    </RequireAuth>
  );
}
