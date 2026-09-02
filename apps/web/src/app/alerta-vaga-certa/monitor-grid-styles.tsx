// Estilos do grid compartilhados por toda seção de cards (grupos de
// notificação e o bucket "novas vagas encontradas") — renderizar uma vez
// (em MonitorView) evita duplicar o <style> por seção, mesmo padrão do
// JobCardResponsiveStyles.
export function MonitorGridStyles() {
  return (
    <style>{`
      .monitor-level-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; }
      @media (max-width: 1100px) { .monitor-level-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
      @media (max-width: 680px) { .monitor-level-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; } }
    `}</style>
  );
}
