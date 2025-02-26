-- CreateEnum
CREATE TYPE "StockAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "StockAlertNotification" (
    "id" TEXT NOT NULL,
    "type" "StockAlertType" NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "StockAlertSeverity" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "StockAlertNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockAlertNotification_productId_idx" ON "StockAlertNotification"("productId");

-- CreateIndex
CREATE INDEX "StockAlertNotification_timestamp_idx" ON "StockAlertNotification"("timestamp");
