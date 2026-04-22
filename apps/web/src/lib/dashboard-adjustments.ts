export type DashboardAdjustmentsData = {
  notes: string | null;
  scoreBefore: number | null;
  scoreFinal: number | null;
};

export function shouldShowAdjustmentsAction(input: {
  canDownload: boolean;
  notes: string | null;
  scoreBefore: number | null;
  scoreFinal: number | null;
}) {
  if (!input.canDownload) return false;

  return Boolean(
    input.notes || input.scoreBefore !== null || input.scoreFinal !== null,
  );
}
