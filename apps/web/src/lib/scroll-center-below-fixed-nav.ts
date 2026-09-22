// Rola a página até `target`, centralizando-o dentro do espaço
// REALMENTE visível (viewport menos a altura de qualquer <nav> fixed no
// topo) — nunca contra a altura total do viewport, como
// scrollIntoView({block:"center"}) faz. Isso importa porque um <nav>
// fixed cobre uma faixa fixa no topo da tela; centralizar ignorando isso
// corta o topo do elemento atrás da nav. Quando o elemento é mais alto
// que o espaço visível, alinha o topo dele logo abaixo da nav — sempre
// mostra o começo do elemento, nunca corta o topo.
//
// Extraído de radar/end-of-description-cta.tsx (onde o problema apareceu
// primeiro, com o card de resultado da análise) — reaproveitado por
// radar/external-apply-gate.tsx pro mesmo padrão de scroll.
export function scrollCenterBelowFixedNav(target: Element) {
  if (typeof window === "undefined") return;

  const fixedNav = Array.from(document.querySelectorAll("nav")).find(
    (el) => window.getComputedStyle(el).position === "fixed",
  );
  const navHeight = fixedNav?.getBoundingClientRect().height ?? 0;
  const rect = target.getBoundingClientRect();
  const visibleHeight = window.innerHeight - navHeight;
  const extraSpace = Math.max(0, visibleHeight - rect.height);
  const desiredTop = navHeight + extraSpace / 2;
  const scrollDelta = rect.top - desiredTop;

  window.scrollTo({
    top: window.scrollY + scrollDelta,
    behavior: "smooth",
  });
}
