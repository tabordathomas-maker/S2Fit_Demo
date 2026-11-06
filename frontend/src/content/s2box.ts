/** Contenido fijo de la página S2 Box. Edita aquí los textos; las cajas y los planes vienen del panel. */

export type BenefitIcon = "shirt" | "gift" | "sachet" | "card";

export interface BoxBenefit {
  title: string;
  description: string;
  icon: BenefitIcon;
}

export const S2BOX = {
  name: "S2 Box",
  tagline: "Entrena • Avanza • Sorpréndete",
  brandPhrase: "More than a brand",
  intro: "Cada mes recibes una caja sorpresa S2 pensada para acompañar tu entrenamiento.",
  benefitsTitle: "¿Qué trae tu S2 Box?",
  benefits: [
    { title: "Tu prenda deportiva S2", description: "Diseño, comodidad y estilo.", icon: "shirt" },
    {
      title: "Una sorpresa en cada caja",
      description:
        "Puede ser asesoría con una nutricionista, una clase personalizada, descuentos en marcas aliadas o una clase de valoración.",
      icon: "gift",
    },
    { title: "Sachets de suplementación", description: "Para potenciar tus resultados.", icon: "sachet" },
    {
      title: "Mensaje que inspira",
      description: "Una tarjeta para recordarte que tu bienestar también se entrena.",
      icon: "card",
    },
  ] satisfies BoxBenefit[],
  cta: "Descubre todo lo que hay en tu S2 Box",
  plansTitle: "Planes",
  note: "El contenido sorpresa puede variar en cada caja.",
};

/** Textos de las cajas misteriosas (portada, apertura y panel). */
export const S2BOX_BOXES = {
  title: "Cajas S2 Box",
  intro: "Descubre las sorpresas de S2 Box. Ábrelas con tu membresía activa.",
  openLabel: "Abrir S2 Box",
  badgePlus: "Exclusivo membresía",
  badgeFree: "Para todos",
  needMembership: "Necesitas la membresía S2 Box activa para abrir esta caja",
  claimLabel: "WhatsApp para el envío",
  claimBusy: "Registrando…",
  claimTitle: "¡Reclamo registrado!",
  claimAlready: "Ya tenías un reclamo pendiente",
  claimDetail: "Escríbenos por WhatsApp para coordinar el envío de tu S2 Box.",
  back: "← Volver a S2 Box",
} as const;
