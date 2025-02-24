-- AlterEnum
ALTER TYPE "StockAlertType" ADD VALUE 'QUEUED_ORDER';

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "stock" SET DEFAULT 0;
