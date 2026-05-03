import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Nova empresa");

export { default, metadata } from "../../ingestion/new/page";
