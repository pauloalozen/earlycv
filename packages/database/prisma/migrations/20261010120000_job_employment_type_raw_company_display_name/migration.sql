-- PR 2b: valor de contratação como veio da fonte (employmentType passa a
-- ser o normalizado) e nome de exibição da empresa editável no admin
-- (null = calculado a partir de Company.name).
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "displayName" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "employmentTypeRaw" TEXT;
