import pdfParse from "pdf-parse";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("PDF buffer is empty or unreadable");
  }

  try {
    const data = await pdfParse(buffer);
    const text = data.text.trim();

    if (!text) {
      throw new Error("PDF contains no extractable text");
    }

    return text;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("PDF contains no extractable text")
    ) {
      throw error;
    }
    throw new Error(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
