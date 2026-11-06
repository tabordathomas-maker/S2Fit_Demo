import { useNavigate } from "react-router-dom";

import { Badge, Button } from "../../components/ui";
import { S2BOX_BOXES } from "../../content/s2box";
import { useAsync } from "../../services/useAsync";
import { useAuth } from "../auth/AuthProvider";
import { ProductImage } from "../catalog/ProductImage";
import { s2boxApi, type MysteryBoxCover } from "./api";

export interface MembershipState {
  loading: boolean;
  active: boolean;
}

/** Tarjetas de cajas misteriosas: la portada es pública; abrir la caja depende del acceso. */
export function MysteryBoxes({ membership, onNeedMembership }: { membership: MembershipState; onNeedMembership: () => void }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const boxes = useAsync(() => s2boxApi.boxes(), []);
  const list = boxes.data ?? [];
  // Sin cajas (o sin conexión) la sección no se muestra y la página sigue igual que antes.
  if (list.length === 0) return null;

  const open = (box: MysteryBoxCover) => {
    if (box.content_access === "free") {
      navigate(`/s2-box/caja/${box.id}`);
      return;
    }
    if (!session) {
      navigate(`/ingresar?next=${encodeURIComponent("/s2-box")}`);
      return;
    }
    if (membership.loading) return;
    if (!membership.active) {
      onNeedMembership();
      return;
    }
    navigate(`/s2-box/caja/${box.id}`);
  };

  return (
    <section className="py-[72px]" aria-labelledby="boxes-title">
      <div className="wrap flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h2 id="boxes-title" className="text-[clamp(26px,3.5vw,36px)] text-burgundy">{S2BOX_BOXES.title}</h2>
          <p className="muted">{S2BOX_BOXES.intro}</p>
        </div>
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          {list.map((box) => (
            <article key={box.id} className="flex flex-col overflow-hidden rounded-3xl bg-white" aria-label={box.title}>
              <ProductImage src={box.cover_url} alt={box.cover_alt || box.title} className="w-full" />
              <div className="flex flex-1 flex-col gap-3 p-[22px]">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={box.content_access === "plus" ? "burgundy" : "green"}>
                    {box.content_access === "plus" ? S2BOX_BOXES.badgePlus : S2BOX_BOXES.badgeFree}
                  </Badge>
                </div>
                <h3 className="font-display text-xl">{box.title}</h3>
                {box.teaser && <p className="muted">{box.teaser}</p>}
                <Button
                  variant="dark"
                  className="mt-auto self-start"
                  aria-label={`${S2BOX_BOXES.openLabel}: ${box.title}`}
                  onClick={() => open(box)}
                >
                  {S2BOX_BOXES.openLabel}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
