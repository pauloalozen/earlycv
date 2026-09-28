import { AdminPageWrap } from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import {
  listAdminAffiliateCampaigns,
  listAdminAffiliatePartners,
} from "@/lib/admin-affiliates-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { CampanhasCupomClient } from "./campanhas-cupom-client";

export const metadata = buildAdminMetadata("Campanhas de cupom");

export default async function AdminCampanhasCupomPage() {
  const [partners, campaigns] = await Promise.all([
    listAdminAffiliatePartners(),
    listAdminAffiliateCampaigns(),
  ]);

  return (
    <AdminPageWrap>
      <AdminShellHeader
        title="Campanhas de cupom"
        subtitle="Criadores, campanhas e códigos de cupom por criador — desconto, bônus de créditos e relatório de resultados."
      />
      <CampanhasCupomClient
        initialPartners={partners}
        initialCampaigns={campaigns}
      />
    </AdminPageWrap>
  );
}
