import { formatPhone } from "../services/phone";
import { Field } from "./ui";

type Props = {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
};

/** Campo de celular colombiano: no reformatea mientras se escribe, solo al salir del campo. */
export function PhoneField({ id, label = "Celular (WhatsApp)", value, onChange, required, hint = "Tu celular de 10 dígitos, sin +57." }: Props) {
  return (
    <Field
      label={label}
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="300 123 4567"
      maxLength={20}
      required={required}
      hint={hint}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onChange(formatPhone(value))}
    />
  );
}
