correções:

1. Quando o usuário seleciona keyword que não tem no seu cv, o score que está aparecendo no card de score na tela plano
   está mostrando valor sem considerar os pontos do keyword selecionado

2. Retirar o card de aviso de quantidade de candidados que já analisaram a vaga, vamos voltar isso quando o sistema
   tiver bastante volume de acesso de usuário, por enquanto pode deixar inativo.

3. Na rota adaptar, o sistema está fazendo o parse do documento depois validando a vaga, o sistema demora para dar erro
   quando a vaga é fora do que é esperado, o sistema deve primeiro fazer as checagens de cv quando é texto digitado, depois
   checagem da vaga, se passar ai sim fazer o parse do documento anexo,
