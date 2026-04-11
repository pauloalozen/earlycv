---
name: Page transition scrollbar fix
description: Como corrigir scrollbar piscando durante animação de transição de tela
type: feedback
---

Usar sempre `translateY(-10px)` no keyframe de entrada de página, nunca `translateY(10px)`.

**Why:** `translateY(10px)` empurra o conteúdo para baixo no primeiro frame, estendendo além do fundo da viewport e ativando a scrollbar do browser. `translateY(-10px)` move o conteúdo para cima, nunca causa overflow no fundo.

**How to apply:** Em qualquer animação de fade-in de página (page-transition, modal entry, etc.), sempre usar translateY negativo para o estado inicial.
