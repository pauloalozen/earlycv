export function getDownloadCtaCopy(
  format: "pdf" | "docx",
  downloading: "pdf" | "docx" | null,
): string {
  if (downloading === format) {
    return format === "pdf" ? "Gerando PDF..." : "Gerando DOCX...";
  }

  return format === "pdf" ? "Baixar PDF" : "Baixar DOCX";
}
