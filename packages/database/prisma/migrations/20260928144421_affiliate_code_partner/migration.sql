/*
  Warnings:

  - You are about to drop the column `partnerId` on the `AffiliateCampaign` table. All the data in the column will be lost.
  - Added the required column `partnerId` to the `AffiliateCode` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AffiliateCampaign" DROP CONSTRAINT "AffiliateCampaign_partnerId_fkey";

-- DropIndex
DROP INDEX "AffiliateCampaign_partnerId_idx";

-- AlterTable
ALTER TABLE "AffiliateCampaign" DROP COLUMN "partnerId";

-- AlterTable
ALTER TABLE "AffiliateCode" ADD COLUMN     "partnerId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "AffiliateCode_partnerId_idx" ON "AffiliateCode"("partnerId");

-- AddForeignKey
ALTER TABLE "AffiliateCode" ADD CONSTRAINT "AffiliateCode_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
