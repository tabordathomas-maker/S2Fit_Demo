import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useNotifications } from "../features/notifications/NotificationsProvider";
import type { NotificationStatus } from "../features/notifications/api";
import { formatDateTime } from "../services/format";

const PILL: Record<NotificationStatus, string> = {
  pending: "bg-beige text-burgundy",
  accepted: "bg-emerald-100 text-emerald-900",
  rejected: "bg-burgundy text-cream",
};

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const { feed, markSeen } = useNotifications();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(false);
    setHighlight(new Set(feed.items.filter((item) => item.unread).map((item) => item.id)));
    setOpen(true);
    if (feed.unread_count > 0) void markSeen();
  };

  const count = feed.unread_count;
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-beige px-2"
        aria-label={`Notificaciones (${count} sin leer)`}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={toggle}
      >
        <BellIcon />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-burgundy px-1 text-xs font-bold text-cream" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          id="notifications-panel"
          role="region"
          aria-label="Notificaciones"
          className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-beige bg-white p-3 shadow-lg"
        >
          {feed.items.length === 0 ? (
            <p className="p-3 text-muted">No tienes notificaciones.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-beige overflow-y-auto">
              {feed.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.link}
                    onClick={() => setOpen(false)}
                    className={`block rounded-xl p-3 hover:bg-cream ${highlight.has(item.id) ? "bg-cream" : ""}`}
                  >
                    <span className="block text-sm font-bold text-muted">{item.reference}</span>
                    <span className="block font-bold">{item.title}</span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-3 py-1 text-sm font-bold ${PILL[item.status]}`}>{item.status_label}</span>
                      <span className="text-sm text-muted">{formatDateTime(item.occurred_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
