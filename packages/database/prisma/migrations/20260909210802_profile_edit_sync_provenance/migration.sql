-- Achado 2026-09-09: edições diretas em UserProfile (blocos do CV Master em
-- /meu-cv-master) nunca alimentavam análises/gerações novas — o pipeline
-- canônico só lia do CvStructuredProfile extraído do arquivo original,
-- congelado pra sempre. Esta migration só adiciona proveniência formal pra
-- essa sincronização (UserProfileMasterSyncService), sem mudar nenhuma
-- coluna nem tabela existente.

-- AlterEnum
ALTER TYPE "CvSubmissionOrigin" ADD VALUE 'PROFILE_EDIT';

-- AlterEnum
ALTER TYPE "CvMasterPromotionReason" ADD VALUE 'PROFILE_EDIT_SYNC';
