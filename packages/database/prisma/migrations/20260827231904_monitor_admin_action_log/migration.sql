-- CreateTable
CREATE TABLE "MonitorAdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorAdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorAdminActionLog_entityType_entityId_createdAt_idx" ON "MonitorAdminActionLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "MonitorAdminActionLog_adminId_createdAt_idx" ON "MonitorAdminActionLog"("adminId", "createdAt");
