export const ALLOWED_CV_FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
] as const;

export function isAllowedCvUploadMimeType(mimeType: string): boolean {
  return ALLOWED_CV_FILE_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_CV_FILE_MIME_TYPES)[number],
  );
}

export const ALLOWED_CV_FORMATS_LABEL = "PDF, DOC, DOCX or ODT";
