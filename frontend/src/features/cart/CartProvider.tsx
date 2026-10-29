import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// El carrito vive en el navegador. El precio guardado aquí es solo una referencia
// visual: el total real lo calcula el backend al crear el pedido.
export interface CartLine {
  variantId: number;
  productSlug: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  displayPrice: number;
  quantity: number;
  maxQuantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  estimatedTotal: number;
  add: (line: CartLine) => void;
  setQuantity: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
}

export const MAX_PER_VARIANT = 10;
const STORAGE_KEY = "s2fit:cart";
const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((l) => Number.isInteger(l?.variantId) && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

function clamp(quantity: number, max: number): number {
  return Math.max(1, Math.min(quantity, max, MAX_PER_VARIANT));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Almacenamiento no disponible (modo privado): el carrito sigue en memoria.
    }
  }, [lines]);

  const add = useCallback((line: CartLine) => {
    setLines((current) => {
      const existing = current.find((l) => l.variantId === line.variantId);
      if (!existing) return [...current, { ...line, quantity: clamp(line.quantity, line.maxQuantity) }];
      return current.map((l) =>
        l.variantId === line.variantId
          ? { ...l, ...line, quantity: clamp(l.quantity + line.quantity, line.maxQuantity) }
          : l,
      );
    });
  }, []);

  const setQuantity = useCallback((variantId: number, quantity: number) => {
    setLines((current) => current.map((l) => (l.variantId === variantId ? { ...l, quantity: clamp(quantity, l.maxQuantity) } : l)));
  }, []);

  const remove = useCallback((variantId: number) => {
    setLines((current) => current.filter((l) => l.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      estimatedTotal: lines.reduce((sum, l) => sum + l.displayPrice * l.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de CartProvider");
  return ctx;
}
