import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import logo from "../assets/logo-s2.png";
import { Header } from "./Header";
import { ServerWakeNotice } from "./ServerWakeNotice";

function Footer() {
  return (
    <footer className="bg-ink py-10 text-beige">
      <div className="wrap flex flex-wrap items-center justify-between gap-4">
        <img src={logo} alt="S2" className="h-11 w-auto invert" />
        <span className="text-[15px]">Construye la vida que quieres · Medellín, Colombia</span>
        <Link to="/privacidad" className="text-[15px] underline underline-offset-4">Tratamiento de datos</Link>
      </div>
    </footer>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <ServerWakeNotice />
    </div>
  );
}
