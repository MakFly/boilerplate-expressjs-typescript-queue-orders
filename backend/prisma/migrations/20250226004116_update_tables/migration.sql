/*
  Warnings:

  - You are about to drop the column `productId` on the `StockAlertNotification` table. All the data in the column will be lost.
  - You are about to drop the column `productName` on the `StockAlertNotification` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `StockAlertNotification` table. All the data in the column will be lost.
  - Added the required column `alert_id` to the `StockAlertNotification` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "StockAlertNotification_productId_idx";

-- AlterTable
ALTER TABLE "StockAlertNotification" DROP COLUMN "productId",
DROP COLUMN "productName",
DROP COLUMN "type",
ADD COLUMN     "alert_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "StockAlertNotification_alert_id_idx" ON "StockAlertNotification"("alert_id");

-- AddForeignKey
ALTER TABLE "StockAlertNotification" ADD CONSTRAINT "StockAlertNotification_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "StockAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
