export const siteConfig = {
  defaultTitle: "EarlyCV",
  description:
    "Encontre vagas antes da maioria com monitoramento de vagas, score de aderencia e adaptacao de curriculo para cada candidatura.",
  keywords: [
    "vagas",
    "empregos",
    "vagas de tecnologia",
    "vagas de produto",
    "vagas de dados",
    "monitoramento de vagas",
    "alerta de vagas",
    "curriculo adaptado",
    "adaptacao de curriculo",
    "job board",
    "radar de vagas",
    "busca de emprego",
    "candidatura",
    "vagas no brasil",
  ],
  name: "EarlyCV",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.earlycv.com.br",
  ogImage:
    process.env.NEXT_PUBLIC_OG_IMAGE_URL ||
    `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.earlycv.com.br"}/og-image.png`,
  titleTemplate: "%s | EarlyCV",
} as const;

export function getAbsoluteUrl(path = "/") {
  return new URL(path, siteConfig.siteUrl).toString();
}
