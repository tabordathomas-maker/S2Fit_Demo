import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "../auth/AuthProvider";
import { notificationsApi, type NotificationFeed, type NotificationItem } from "./api";

export const POLL_MS = 60_000;
export const TOAST_MS = 6_000;

const NOUNS: Record<NotificationItem["kind"], { noun: string; feminine: boolean }> = {
  order: { noun: "pedido", feminine: false },
  subscription: { noun: "solicitud de membresía", feminine: true },
  box_claim: { noun: "reclamo de S2 Box", feminine: false },
};

/** Texto del aviso flotante. Al cliente le dice qué pasó; al admin, qué llegó. */
export function toastText(item: NotificationItem, isAdmin: boolean): string {
  if (isAdmin) return `${item.title} ${item.reference}`;
  const { noun, feminine } = NOUNS[item.kind];
  const verb = item.status_label.toLowerCase().replace(/o$/, feminine ? "a" : "o");
  return `Tu ${noun} ${item.reference} fue ${verb}`;
}

interface NotificationsValue {
  feed: NotificationFeed;
  markSeen: () => Promise<void>;
}

const EMPTY: NotificationFeed = { items: [], unread_count: 0 };
const NotificationsContext = createContext<NotificationsValue>({ feed: EMPTY, markSeen: async () => {} });

export function useNotifications(): NotificationsValue {
  return useContext(NotificationsContext);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin } = useAuth();
  const signedIn = Boolean(session);
  const [feed, setFeed] = useState<NotificationFeed>(EMPTY);
  const [toast, setToast] = useState<string | null>(null);
  // Ids sin leer ya vistos; null hasta la primera consulta (esa no genera aviso).
  const knownUnread = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await notificationsApi.feed();
      const unread = next.items.filter((item) => item.unread);
      const known = knownUnread.current;
      if (known !== null) {
        const fresh = unread.find((item) => !known.has(item.id));
        if (fresh) setToast(toastText(fresh, isAdmin));
      }
      knownUnread.current = new Set(unread.map((item) => item.id));
      setFeed(next);
    } catch {
      // Render puede estar dormido o la red caída: la campanita no debe romper el Header.
    }
  }, [isAdmin]);

  useEffect(() => {
    knownUnread.current = null;
    setFeed(EMPTY);
    setToast(null);
    if (!signedIn) return;
    void load();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, [signedIn, load]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const markSeen = useCallback(async () => {
    try {
      const next = await notificationsApi.markSeen();
      knownUnread.current = new Set();
      // Los elementos conservan su marca hasta la próxima consulta; el contador vuelve a 0 ya.
      setFeed((current) => ({ items: current.items, unread_count: next.unread_count }));
    } catch {
      // Se reintentará la próxima vez que se abra el panel.
    }
  }, []);

  const value = useMemo(() => ({ feed, markSeen }), [feed, markSeen]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {toast !== null && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-burgundy px-5 py-3 text-cream shadow-lg"
        >
          <span className="font-bold">{toast}</span>
          <button type="button" className="min-h-11 rounded-full border-2 border-cream px-4 font-bold" onClick={() => setToast(null)}>
            Cerrar
          </button>
        </div>
      )}
    </NotificationsContext.Provider>
  );
}
