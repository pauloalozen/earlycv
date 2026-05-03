import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Detalhe da fonte");

export { default, metadata } from "../../ingestion/[jobSourceId]/page";
