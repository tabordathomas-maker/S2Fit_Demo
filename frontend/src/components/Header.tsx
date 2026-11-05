import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

import logo from "../assets/logo-s2.png";
import { useAuth } from "../features/auth/AuthProvider";
import { useCart } from "../features/cart/CartProvider";

const NAV = [
  { to: "/", label: "Inicio", end: true },
  { to: "/tienda", label: "Tienda" },
  { to: "/mi-ruta", label: "Mi Ruta" },
  { to: "/s2-box", label: "S2 Box" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `inline-flex min-h-11 items-center rounded-full border-2 px-4 py-2 text-base font-bold transition-colors ${
    isActive ? "border-burgundy bg-burgundy text-cream" : "border-transparent hover:border-beige"
  }`;
}

export function Header() {
  const { profile, isAdmin, session } = useAuth();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="border-b border-beige bg-white py-4">
      <div className="wrap flex flex-wrap items-center justify-between gap-4">
        <Link to="/" onClick={close} aria-label="S2 Fit Evolution, inicio">
          <img src={logo} alt="S2 Fit Evolution" className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-2 md:hidden">
          <Link to="/carrito" className="inline-flex min-h-11 items-center rounded-full bg-beige px-4 font-bold">
            Bolsa ({count})
          </Link>
          <button
            type="button"
            className="min-h-11 rounded-full border-2 border-beige px-4 font-bold"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((v) => !v)}
          >
            Menú
          </button>
        </div>
        <nav
          id="main-nav"
          aria-label="Principal"
          className={`${open ? "flex" : "hidden"} w-full flex-col gap-2 md:flex md:w-auto md:flex-row md:flex-wrap md:items-center`}
        >
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass} onClick={close}>
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" className={navClass} onClick={close}>Admin</NavLink>
          )}
          <NavLink to={session ? "/cuenta" : "/ingresar"} className={navClass} onClick={close}>
            {session ? (profile?.full_name?.split(" ")[0] ?? "Mi cuenta") : "Ingresar"}
          </NavLink>
          <Link
            to="/carrito"
            onClick={close}
            className="hidden min-h-11 items-center rounded-full bg-beige px-4 font-bold md:inline-flex"
          >
            Bolsa ({count})
          </Link>
        </nav>
      </div>
    </header>
  );
}
