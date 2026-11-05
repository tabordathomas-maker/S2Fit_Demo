/** Contenido fijo de la página S2 Box. Edita aquí los textos; la galería y los planes vienen del panel. */

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
  galleryTitle: "Así se ve tu caja",
  galleryEmpty: "Muy pronto verás aquí nuestras cajas",
  plansTitle: "Planes",
  note: "El contenido sorpresa puede variar en cada caja.",
};
