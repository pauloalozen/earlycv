App rodando localmente. Usuário de teste com conta ativa (com crédito e sem crédito para cobrir os dois casos).

---

1. Landing page (variant-E)

O que mudou: implementação completa da variant-E, polish mobile, favicon, ticker, nav underline.

- [x] Abrir / no desktop — verificar layout, nav, ticker e hero alinhados ao design variant-E
- [x] Abrir no mobile (DevTools 390px) — layout responsivo, ticker texto correto, nav sem underline quebrado
- [x] Verificar favicon no browser tab (PNG oficial, não o antigo)
- [x] Clicar nos links de nav da landing — âncoras rolam corretamente
- [x] Links de Privacidade e Termos no rodapé funcionam

---

2. Demo (S5)

O que mudou: mock S5 carregado direto na página, sem depender de sessionStorage.

- [ ] Acessar a rota de demo sem histórico de sessão (aba anônima)
- [ ] Verificar que sinais_referencia aparecem na tela (seção S5 renderiza)
- [ ] Recarregar a página — S5 continua visível (não dependia de sessionStorage)

---

3. Fluxo de adaptação de CV (regressão core)

O que mudou: refactor do prompt de análise + suporte a múltiplos provedores AI.

- [ ] Upload de CV + colar descrição de vaga → análise dispara
- [ ] Badge de diagnóstico exibe ≈ 90s (não o valor antigo)
- [ ] Build loader aparece durante a análise (não o loader pulsante antigo)
- [ ] Resultado retorna com CV adaptado correto
- [ ] Download PDF e DOCX funcionam (overlay de etapas: montando → concluindo → arquivo)

---

4. Candidaturas — fluxo de prep de entrevista

O que mudou: múltiplos fixes nas regras de unlock, fluxo de prep, validações.

4a. CV travado no estado APPLIED

- [ ] Candidatura no estado APPLIED — botão de prep de entrevista aparece
- [ ] Clicar em prep → fluxo de unlock não trava

4b. Seletor de CV (múltiplos CVs desbloqueados, sem prep gerada)

- [ ] Com 2+ CVs desbloqueados e sem prep de entrevista → seletor de CV abre ao clicar
- [ ] Selecionar CV → fluxo de prep prossegue normalmente

4c. Prep de entrevista já gerada

- [ ] Candidatura com prep já criada → botão exibe "Registrar próximo passo" (não "Gerar prep")
- [ ] Clicar → ação correta (não tenta criar de novo)

4d. Validação de descrição de vaga

- [ ] Tentar gerar prep sem descrição de vaga preenchida → erro de validação aparece
- [ ] Preencher descrição → fluxo libera normalmente

---

5. CV Unlock — fluxo de desbloqueio

O que mudou: keywords possíveis, pontuação, loader e redirect pós-unlock.

- [ ] Iniciar unlock de CV em candidatura elegível
- [ ] Keywords possíveis exibidas corretamente (sem keywords fantasma)
- [ ] Loader aparece durante o unlock
- [ ] Após unlock com sucesso: redirect correto para a tela de resultado (não fica parado)
- [ ] Score do CV exibido após desbloqueio

---

6. UX — transições de tela

O que mudou: build loader substituiu o loader pulsante em todas as transições.

- [ ] Navegar entre /dashboard, /adaptar, /candidaturas — build loader aparece nas transições (não pulsante)
- [ ] Clicar em voltar no browser (back) — não trava no spinner (regressão do PageShell)
- [ ] Forward/back consecutivos funcionam sem spinner preso

---

7. Admin — CV Benchmark (novo)

O que mudou: ferramenta nova completa — navegação, importação, análise em massa, score.

7a. Navegação

- [ ] No admin, sidebar esquerda exibe "CV Benchmark" no menu
- [ ] No admin, topbar também exibe o item "CV Benchmark"
- [ ] Ambos navegam para a rota correta da ferramenta

7b. Importação — pasta

- [ ] Botão "Importar Pasta" abre seletor de pasta
- [ ] Pasta com estrutura cv.txt (ou cv.md) + vaga.md é reconhecida
- [ ] Importação de pasta em lote funciona com múltiplas entradas

7c. Importação — arquivos avulsos

- [ ] Botão de arquivos avulsos é separado do botão de pasta (não o mesmo)
- [ ] Aceita cv.txt, cv.md e vaga.md como arquivos avulsos
- [ ] Arquivo avulso importa e aparece na lista

7d. Análise e score

- [ ] Rodar análise em um par CV + vaga
- [ ] Score exibido — não ultrapassa 100 (cap funcionando)
- [ ] Reanálise: keywords encontradas recebem os pontos prometidos (determinístico)
- [ ] Score pós-ajustes é a base do score após reanálise (não o score bruto)
- [ ] Tooltip da coluna de drift indica base de comparação correta
- [ ] Drift não flutua sem motivo entre análises do mesmo par

---

8. AI — múltiplos provedores

O que mudou: variável AI_SUPPLIER permite trocar entre provedores.

- [ ] Com AI_SUPPLIER padrão — fluxo de análise funciona normalmente
- [ ] (Se tiver env alternativa) Trocar AI_SUPPLIER → análise ainda retorna sem erro

---

9. Regressão geral

- [ ] /dashboard carrega histórico paginado corretamente
- [ ] CV Master: /cv-base — upload, atualização e download do CV funcionam
- [ ] Em /adaptar com CV Master cadastrado: opções "Usar meu CV base" e "Enviar outro CV" aparecem
- [ ] Header fixo com transparência em todas as telas (sem borda inferior)

---

Ordem sugerida: Landing → Demo → Core adaptação → Candidaturas (4a→4d) → CV Unlock → UX transições → Admin Benchmark → Regressão geral.

Os fluxos de candidaturas (4) e CV Benchmark (7) são os que têm mais mudanças novas — priorizar se o tempo apertar.
