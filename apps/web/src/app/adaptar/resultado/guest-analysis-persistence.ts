export function shouldPersistGuestAnalysis(input: {
  autoSave: boolean;
  hasRawData: boolean;
  hasReviewAdaptationId: boolean;
  isAuthenticated: boolean;
  persistenceAlreadyAttempted: boolean;
}) {
  if (input.persistenceAlreadyAttempted) {
    return false;
  }

  if (!input.isAuthenticated) {
    return false;
  }

  if (!input.hasRawData || input.hasReviewAdaptationId) {
    return false;
  }

  return true;
}
