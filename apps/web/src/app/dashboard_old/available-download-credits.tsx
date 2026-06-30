"use client";

import { useEffect, useState } from "react";

const CREDIT_REDEEMED_EVENT = "dashboard:credit-redeemed";

type Props = {
  initialDisplay: string | number;
  initialCreditsRemaining: number | null;
};

export function AvailableDownloadCredits({
  initialDisplay,
  initialCreditsRemaining,
}: Props) {
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(
    initialCreditsRemaining,
  );

  useEffect(() => {
    if (initialCreditsRemaining === null) return;

    const onCreditRedeemed = () => {
      setCreditsRemaining((current) => {
        if (typeof current !== "number") return current;
        return Math.max(0, current - 1);
      });
    };

    window.addEventListener(CREDIT_REDEEMED_EVENT, onCreditRedeemed);
    return () =>
      window.removeEventListener(CREDIT_REDEEMED_EVENT, onCreditRedeemed);
  }, [initialCreditsRemaining]);

  const content =
    typeof creditsRemaining === "number" ? creditsRemaining : initialDisplay;

  return <>{content}</>;
}
