import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./features/auth/AuthPages";
import { AuthProvider } from "./features/auth/AuthProvider";
import { CartPage } from "./features/cart/CartPage";
import { CartProvider } from "./features/cart/CartProvider";
import { ProductPage } from "./features/catalog/ProductPage";
import { ShopPage } from "./features/catalog/ShopPage";
import { OrdersPage } from "./features/orders/OrdersPage";
import { S2BoxPage } from "./features/subscriptions/S2BoxPage";
import { AccountPage } from "./pages/AccountPage";
import { HomePage } from "./pages/HomePage";
import { MiRutaPage } from "./pages/MiRutaPage";
import { NotFoundPage, PrivacyPage } from "./pages/StaticPages";
import { RequireAdmin, RequireAuth } from "./routes/guards";

// El panel de administración se descarga solo cuando se visita.
const AdminPage = lazy(() => import("./features/admin/AdminPage").then((m) => ({ default: m.AdminPage })));

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="tienda" element={<ShopPage />} />
        <Route path="tienda/:slug" element={<ProductPage />} />
        <Route path="carrito" element={<CartPage />} />
        <Route path="mi-ruta" element={<MiRutaPage />} />
        <Route path="s2-box" element={<S2BoxPage />} />
        {/* Enlaces antiguos de S2 Plus */}
        <Route path="s2-plus" element={<Navigate to="/s2-box" replace />} />
        <Route path="plus" element={<Navigate to="/s2-box" replace />} />
        <Route path="ingresar" element={<LoginPage />} />
        <Route path="registro" element={<RegisterPage />} />
        <Route path="recuperar-contrasena" element={<ForgotPasswordPage />} />
        <Route path="restablecer-contrasena" element={<ResetPasswordPage />} />
        <Route path="privacidad" element={<PrivacyPage />} />
        <Route path="cuenta" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="pedidos" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route
          path="admin"
          element={<RequireAdmin><Suspense fallback={<div className="wrap"><Spinner /></div>}><AdminPage /></Suspense></RequireAdmin>}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

// HashRouter (#/ruta) evita errores 404 al recargar o abrir rutas directas en GitHub Pages.
export function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </CartProvider>
    </AuthProvider>
  );
}
