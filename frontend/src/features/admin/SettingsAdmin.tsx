import { useEffect, useState, type FormEvent } from "react";

import { PhoneField } from "../../components/PhoneField";
import { Alert, Button, Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatDateTime } from "../../services/format";
import { formatPhone, phoneForSubmit } from "../../services/phone";
import { applyWhatsAppNumber } from "../../services/settings";
import { useAsync } from "../../services/useAsync";
import { buildWhatsAppUrl } from "../../services/whatsapp";
import { useAuth } from "../auth/AuthProvider";
import { adminApi } from "./api";

/** Muestra un número guardado (573001234567) como 300 123 4567. */
export function prettyWhatsApp(digits: string | null | undefined): string {
  return formatPhone(digits);
}

export function SettingsAdmin() {
  const { profile } = useAuth();
  const settings = useAsync(() => adminApi.settings(), []);
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) setNumber(prettyWhatsApp(settings.data.whatsapp_number));
  }, [settings.data]);

  const save = async (value: string | null) => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await adminApi.updateSettings(value);
      applyWhatsAppNumber(updated.whatsapp_number);
      settings.setData(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      void save(phoneForSubmit(number));
    } catch (err) {
      setSaved(false);
      setError(errorMessage(err));
    }
  };

  const current = settings.data?.whatsapp_number ?? null;
  const testUrl = current ? buildWhatsAppUrl("Hola, esta es una prueba del WhatsApp de la tienda S2 Fit.", current) : null;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h3 className="text-2xl">WhatsApp de la tienda</h3>
          <p className="muted mt-1">
            A este número llegan los mensajes de las compras y las suscripciones. Escribe el celular de 10 dígitos;
            el sistema agrega el indicativo de Colombia.
          </p>
        </div>

        {settings.loading && <Spinner />}
        {settings.error && <Alert>{settings.error}</Alert>}
        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="success">Número guardado. Los próximos pedidos abrirán WhatsApp con este número.</Alert>}

        {settings.data && (
          <>
            <p className="text-sm">
              Número actual: <strong>{current ? prettyWhatsApp(current) : "sin configurar"}</strong>
              {settings.data.updated_at && current && (
                <span className="text-muted"> · cambiado {formatDateTime(settings.data.updated_at)}
                  {settings.data.updated_by_email ? ` por ${settings.data.updated_by_email}` : ""}</span>
              )}
            </p>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <PhoneField
                id="store-whatsapp"
                label="Número de WhatsApp"
                hint="El celular de 10 dígitos al que escribirán los clientes, sin +57."
                value={number}
                onChange={setNumber}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="dark" disabled={saving}>{saving ? "Guardando…" : "Guardar número"}</Button>
                {profile?.phone && (
                  <Button type="button" disabled={saving} onClick={() => void save(profile.phone)}>
                    Usar mi celular ({formatPhone(profile.phone)})
                  </Button>
                )}
                {testUrl && (
                  <a href={testUrl} target="_blank" rel="noopener noreferrer" className="self-center font-bold text-burgundy underline">
                    Probar enlace
                  </a>
                )}
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
