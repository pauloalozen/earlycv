export type DownloadProgressStage = "preparing" | "finalizing";

function inferFilenameFromDisposition(
  disposition: string | null,
): string | null {
  if (!disposition) return null;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return null;
}

export async function downloadFromApi(options: {
  url: string;
  fallbackFilename: string;
  onStageChange?: (stage: DownloadProgressStage) => void;
}) {
  const { url, fallbackFilename, onStageChange } = options;

  onStageChange?.("preparing");
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Falha ao montar arquivo para download.");
  }

  onStageChange?.("finalizing");

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  const filename =
    inferFilenameFromDisposition(disposition) ?? fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}
