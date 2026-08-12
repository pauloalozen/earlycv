import { IsIn } from "class-validator";

const MANUAL_ADAPTER_TYPES = [
  "gupy",
  "custom_html",
  "custom_api",
  "greenhouse",
  "lever",
  "ashby",
  "inhire",
  "teamtailor",
  "talentbrew",
  "workday",
] as const;

export type ManualAdapterType = (typeof MANUAL_ADAPTER_TYPES)[number];

export class StartManualAdapterRunDto {
  @IsIn(MANUAL_ADAPTER_TYPES)
  adapterType!: ManualAdapterType;
}
