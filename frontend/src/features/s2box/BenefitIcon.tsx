import type { ReactElement } from "react";

import type { BenefitIcon as IconName } from "../../content/s2box";

const PATHS: Record<IconName, ReactElement> = {
  shirt: <path d="M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0Z" />,
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M7.5 8a2.5 2.5 0 1 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 1 1 0 5" />
    </>
  ),
  sachet: (
    <>
      <path d="M6 3h12v3l-1 1v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7L6 6Z" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 15s-3-1.8-3-4a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 2.2-3 4-3 4Z" />
    </>
  ),
};

/** Íconos simples en SVG (sin librería de íconos). Decorativos: el título ya describe el beneficio. */
export function BenefitIcon({ name }: { name: IconName }) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
