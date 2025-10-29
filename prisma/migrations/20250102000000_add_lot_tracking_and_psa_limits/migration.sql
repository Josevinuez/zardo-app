-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "initialDebt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "upsTrackingNumber" TEXT,
    "trackingStatus" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "vendor" TEXT,
    "lotType" TEXT,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "eventDescription" TEXT,
    "eventDate" TIMESTAMP(3),
    "location" TEXT,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_products" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "estimatedQuantity" INTEGER NOT NULL DEFAULT 1,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "shopifyProductId" TEXT,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "lot_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_product_variants" (
    "id" TEXT NOT NULL,
    "lotProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variantName" TEXT NOT NULL,
    "condition" TEXT,
    "rarity" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimatedValue" DOUBLE PRECISION,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "shopifyVariantId" TEXT,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "lot_product_variants_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_products" ADD CONSTRAINT "lot_products_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_product_variants" ADD CONSTRAINT "lot_product_variants_lotProductId_fkey" FOREIGN KEY ("lotProductId") REFERENCES "lot_products"("id") ON DELETE CASCADE ON UPDATE CASCADE; 