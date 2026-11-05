import { useState } from "react";

import { Alert, Pill } from "../../components/ui";
import { useAsync } from "../../services/useAsync";
import { contentApi } from "./api";

const MEAL_SLOTS = [
  { slot: "desayuno", label: "Desayuno" },
  { slot: "almuerzo", label: "Almuerzo" },
  { slot: "cena", label: "Cena" },
  { slot: "snacks", label: "Snacks" },
];

/** Alimentación diaria: una idea por franja del día. Es parte de Mi Ruta (gratis). */
export function MealsPanel() {
  const meals = useAsync(() => contentApi.list("meal"), []);
  const [slot, setSlot] = useState("desayuno");
  const meal = meals.data?.find((m) => m.meal_slot === slot);
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-[26px]">Alimentación diaria</h2>
      {meals.error && <Alert>{meals.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {MEAL_SLOTS.map((m) => <Pill key={m.slot} active={slot === m.slot} onClick={() => setSlot(m.slot)}>{m.label}</Pill>)}
      </div>
      <div className="card">
        <p className="muted text-lg">{meal?.body ?? meal?.title ?? "Pronto publicaremos la idea de hoy."}</p>
      </div>
    </div>
  );
}
