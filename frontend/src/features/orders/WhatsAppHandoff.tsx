import { useState } from "react";

import { Alert, buttonClasses } from "../../components/ui";
import { buildWhatsAppUrl } from "../../services/whatsapp";

/** Muestra la referencia creada y el enlace a WhatsApp (por si la redirección no se abre sola). */
export function WhatsAppHandoff({ title, reference, message, detail, note }: { title: string; reference: string; message: string; detail?: string; note?: string }) {
  const url = buildWhatsAppUrl(message);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="card flex flex-col gap-4">
      <h2 className="text-3xl">{title}</h2>
      <p className="text-lg">
        Tu referencia es <strong className="font-mono text-burgundy">{reference}</strong>
      </p>
      {detail && <p className="muted">{detail}</p>}
      {note && <p className="font-bold text-burgundy">{note}</p>}
      {url ? (
        <a href={url} className={buttonClasses("dark", "self-start")}>Abrir WhatsApp</a>
      ) : (
        <Alert tone="info">
          El número de WhatsApp de la tienda aún no está configurado. Guarda tu referencia y escríbenos con este mensaje.
        </Alert>
      )}
      <details>
        <summary className="cursor-pointer font-bold">Ver mensaje</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-cream p-4 font-sans text-sm">{message}</pre>
        <button type="button" onClick={copy} className="mt-2 font-bold text-burgundy underline">
          {copied ? "Mensaje copiado" : "Copiar mensaje"}
        </button>
      </details>
    </div>
  );
}
