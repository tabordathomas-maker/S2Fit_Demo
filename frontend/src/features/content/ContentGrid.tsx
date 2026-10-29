import { useState } from "react";

import { Alert, Badge, LockIcon, Pill, PlayIcon, Spinner, buttonClasses } from "../../components/ui";
import { errorMessage } from "../../services/api";
import type { ContentItem, ContentKind } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { contentApi } from "./api";

const TABS: { kind: ContentKind; label: string }[] = [
  { kind: "routine", label: "Rutinas" },
  { kind: "recipe", label: "Recetas" },
  { kind: "growth", label: "Crecimiento personal" },
];

export function ContentTabs() {
  const [kind, setKind] = useState<ContentKind>("routine");
  const items = useAsync(() => contentApi.list(kind), [kind]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de contenido">
        {TABS.map((t) => (
          <Pill key={t.kind} role="tab" aria-selected={t.kind === kind} active={t.kind === kind} onClick={() => setKind(t.kind)}>
            {t.label}
          </Pill>
        ))}
      </div>
      {items.loading && <Spinner />}
      {items.error && <Alert>{items.error}</Alert>}
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {items.data?.map((item) => <ContentCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

export function ContentCard({ item }: { item: ContentItem }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ContentItem | null>(item.locked ? null : item);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setOpen((v) => !v);
    if (!detail && !item.locked) {
      try {
        setDetail(await contentApi.get(item.id));
      } catch (err) {
        setError(errorMessage(err));
      }
    }
  };

  return (
    <article className="card flex flex-col gap-3 p-5">
      <div className="flex h-[150px] items-center justify-center rounded-2xl bg-beige">
        {item.locked ? <span className="flex items-center gap-2 font-bold text-burgundy"><LockIcon /> S2 Plus</span> : <PlayIcon />}
      </div>
      <div className="flex flex-wrap gap-2">{item.access === "plus" && <Badge tone="burgundy">S2 Plus</Badge>}</div>
      <h3 className="text-lg">{item.title}</h3>
      <p className="muted">{item.meta}</p>
      {item.locked ? (
        <p className="text-sm text-muted">Disponible con una membresía S2 Plus activa.</p>
      ) : (
        <button type="button" onClick={toggle} aria-expanded={open} className="self-start font-bold text-burgundy underline">
          {open ? "Ocultar" : "Ver contenido"}
        </button>
      )}
      {open && (
        <div className="flex flex-col gap-3 border-t border-beige pt-3">
          {error && <Alert>{error}</Alert>}
          {detail?.body && <p className="whitespace-pre-line">{detail.body}</p>}
          {detail?.media_url && (
            <a href={detail.media_url} target="_blank" rel="noopener noreferrer" className={buttonClasses("dark", "self-start")}>
              Abrir video o recurso
            </a>
          )}
        </div>
      )}
    </article>
  );
}
