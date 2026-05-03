import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Fontes");

export { default, metadata } from "../ingestion/page";
