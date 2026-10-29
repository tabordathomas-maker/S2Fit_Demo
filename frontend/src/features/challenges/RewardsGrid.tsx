import { useState } from "react";

import { Alert } from "../../components/ui";
import { errorMessage } from "../../services/api";
import type { Reward } from "../../services/types";
import { challengesApi } from "./api";

const redemptionLabel = { requested: "Solicitada", fulfilled: "Entregada", cancelled: "Cancelada" } as const;

export function RewardsGrid({ rewards, onRedeemed }: { rewards: Reward[]; onRedeemed: () => void }) {
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const redeem = async (reward: Reward) => {
    setMessage(null);
    try {
      const result = await challengesApi.redeem(reward.id);
      setMessage({ tone: "success", text: result.message });
      onRedeemed();
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {rewards.map((r) => (
          <div
            key={r.id}
            className={`flex flex-col gap-1 rounded-[18px] border-2 p-[18px] ${
              r.unlocked ? "border-burgundy bg-burgundy text-cream" : "border-beige bg-cream text-ink"
            }`}
          >
            <span className="font-bold">Al {r.threshold_pct}% {r.kind === "habit_discount" ? "de cumplimiento" : "de tus objetivos"}</span>
            <span className="font-display text-xl">{r.name}</span>
            <span className="text-sm font-bold">{r.unlocked ? "Desbloqueado" : "Bloqueado"}</span>
            {r.redemption_status && r.redemption_status !== "cancelled" ? (
              <span className="text-sm">Recompensa {redemptionLabel[r.redemption_status].toLowerCase()}</span>
            ) : (
              r.unlocked && (
                <button type="button" onClick={() => redeem(r)} className="mt-2 self-start rounded-full bg-beige px-4 py-1.5 text-sm font-bold text-ink">
                  Solicitar recompensa
                </button>
              )
            )}
          </div>
        ))}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
