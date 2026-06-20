No updateStatus do servidor: quando o usuário muda para APPLIED sem escolher um CV explicitamente, o sistema agora verifica se o currentCvAdaptationId existente aponta para uma análise
ainda travada. Se sim, limpa o campo (null) — evitando que a análise não-desbloqueada apareça como "CV Enviado" e dispare o interviewPrepLocked: true.

Com isso, a candidatura vai para APPLIED sem currentCvAdaptationId, o servidor retorna reason: "missing_selected_cv", e o botão "Liberar CV para entrevista" não aparece. O fluxo correto
volta a ser: usuário libera o CV pela listagem de análises, depois pode preparar a entrevista.
