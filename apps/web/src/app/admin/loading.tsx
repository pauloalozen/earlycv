import { AT } from "./_components/admin-primitives";

// Convenção de rota do Next: loading.tsx num segmento cobre ele e todos os
// filhos que não têm o próprio loading.tsx. Antes disso não existia NENHUM
// loading.tsx em /admin (39 rotas) — toda navegação (incluindo troca de aba
// em /admin/ingestion, que é so um novo ?tab= na mesma rota server-rendered)
// ficava com a tela travada/em branco até o fetch do servidor terminar, sem
// stream nenhum. Isso sozinho já resolve a sensação de "trava" na troca de
// página/aba, independente de quanto o fetch em si demora.
export default function AdminLoading() {
  return (
    <div
      style={{
        alignItems: "center",
        color: AT.muted,
        display: "flex",
        fontSize: 13,
        gap: 8,
        justifyContent: "center",
        padding: "80px 32px",
      }}
    >
      Carregando…
    </div>
  );
}
