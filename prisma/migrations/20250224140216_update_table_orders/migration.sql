-- CreateEnum
CREATE TYPE "StockAlertType" AS ENUM ('LOW_STOCK', 'STOCK_OUT', 'FAILED_ORDER');

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" TEXT NOT NULL,
    "type" "StockAlertType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "product_id" TEXT NOT NULL,
    "order_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockAlert_product_id_idx" ON "StockAlert"("product_id");

-- CreateIndex
CREATE INDEX "StockAlert_order_id_idx" ON "StockAlert"("order_id");

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
