import type { Metadata } from "next";

function buildInternalMetadata(
  title: string,
): Pick<Metadata, "title" | "robots"> {
  return {
    title,
    robots: {
      follow: false,
      index: false,
    },
  };
}

export function buildAdminMetadata(
  page: string,
): Pick<Metadata, "title" | "robots"> {
  return buildInternalMetadata(page);
}

export function buildSuperadminMetadata(
  page: string,
): Pick<Metadata, "title" | "robots"> {
  return buildInternalMetadata(page);
}
