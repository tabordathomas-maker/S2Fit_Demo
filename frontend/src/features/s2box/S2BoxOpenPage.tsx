import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Alert, Button, Spinner } from "../../components/ui";
import { S2BOX_BOXES } from "../../content/s2box";
import { ApiError, errorMessage } from "../../services/api";
import { useAsync } from "../../services/useAsync";
import { buildWhatsAppUrl, navigation } from "../../services/whatsapp";
import { useAuth } from "../auth/AuthProvider";
import { MediaPlayer } from "../content/ContentGrid";
import { WhatsAppHandoff } from "../orders/WhatsAppHandoff";
import { s2boxApi, type BoxClaimCreated } from "./api";

export const NEED_MEMBERSHIP_STATE = { needMembership: true };

/** Contenido de una caja. El acceso lo decide el backend; aquí solo se reacciona a su respuesta. */
export function S2BoxOpenPage() {
  const { id } = useParams();
  const boxId = Number(id);
  const { session } = useAuth();
  const navigate = useNavigate();
  const [claim, setClaim] = useState<BoxClaimCreated | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const content = useAsync(async () => {
    try {
      return await s2boxApi.boxContent(boxId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "membership_required") {
        if (err.details.login_required) {
          navigate(`/ingresar?next=${encodeURIComponent(`/s2-box/caja/${boxId}`)}`, { replace: true });
        } else {
          navigate("/s2-box", { replace: true, state: NEED_MEMBERSHIP_STATE });
        }
        return undefined;
      }
      throw err;
    }
  }, [boxId, session?.user.id]);

  const claimBox = async () => {
    setClaiming(true);
    setError(null);
    try {
      // El reclamo se registra en el backend ANTES de abrir WhatsApp.
      const created = await s2boxApi.claim(boxId);
      setClaim(created);
      const url = buildWhatsAppUrl(created.whatsapp_message);
      if (url) navigation.redirect(url);
    } catch (err) {
      if (err instanceof ApiError && err.code === "membership_required") {
        navigate("/s2-box", { state: NEED_MEMBERSHIP_STATE });
        return;
      }
      setError(errorMessage(err));
    } finally {
      setClaiming(false);
    }
  };

  const box = content.data;
  return (
    <section className="py-12">
      <div className="wrap flex max-w-[800px] flex-col gap-6">
        <Link to="/s2-box" className="inline-flex min-h-11 items-center font-bold text-burgundy">{S2BOX_BOXES.back}</Link>
        {content.loading && !box && <Spinner />}
        {content.error && <Alert>{content.error}</Alert>}
        {box && (
          <>
            <h1 className="text-[clamp(28px,4vw,40px)] text-burgundy">{box.title}</h1>
            {box.content_media_url && <MediaPlayer url={box.content_media_url} title={box.title} />}
            <p className="whitespace-pre-line text-lg leading-relaxed">{box.content_description}</p>
            {error && <Alert>{error}</Alert>}
            {claim ? (
              <WhatsAppHandoff
                title={claim.already_existed ? S2BOX_BOXES.claimAlready : S2BOX_BOXES.claimTitle}
                reference={claim.reference}
                message={claim.whatsapp_message}
                detail={S2BOX_BOXES.claimDetail}
              />
            ) : (
              <Button variant="dark" className="self-start" disabled={claiming} onClick={() => void claimBox()}>
                {claiming ? S2BOX_BOXES.claimBusy : S2BOX_BOXES.claimLabel}
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
