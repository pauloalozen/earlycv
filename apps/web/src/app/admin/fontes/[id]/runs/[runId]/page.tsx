import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Detalhe do run da fonte");

export {
  default,
} from "../../../../ingestion/[jobSourceId]/runs/[runId]/page";
