export type MercadoPagoReturnConfigInput = {
  frontendUrl: string;
  successPath: string;
  failurePath: string;
  pendingPath: string;
};

export type MercadoPagoReturnConfig = {
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  autoReturn?: "approved";
  successUrlIsHttps: boolean;
  autoReturnEnabled: boolean;
  frontendHost: string;
};

export type MercadoPagoItemMetadataInput = {
  flow: "cv_adaptation" | "plan_purchase";
  planLabel?: string;
};

export type MercadoPagoItemMetadata = {
  category_id: string;
  description: string;
};

export function buildMercadoPagoReturnConfig(
  input: MercadoPagoReturnConfigInput,
): MercadoPagoReturnConfig {
  const base = new URL(input.frontendUrl);
  const success = new URL(input.successPath, base).toString();
  const failure = new URL(input.failurePath, base).toString();
  const pending = new URL(input.pendingPath, base).toString();
  const successUrlIsHttps = success.startsWith("https://");

  return {
    backUrls: {
      success,
      failure,
      pending,
    },
    ...(successUrlIsHttps ? { autoReturn: "approved" as const } : {}),
    successUrlIsHttps,
    autoReturnEnabled: successUrlIsHttps,
    frontendHost: base.host,
  };
}

export function buildMercadoPagoItemMetadata(
  input: MercadoPagoItemMetadataInput,
): MercadoPagoItemMetadata {
  const category_id = "services";

  if (input.flow === "cv_adaptation") {
    return {
      category_id,
      description: "Liberacao de CV adaptado no EarlyCV",
    };
  }

  const label = input.planLabel?.trim() || "Plano";

  return {
    category_id,
    description: `Compra de creditos no EarlyCV - ${label}`,
  };
}
