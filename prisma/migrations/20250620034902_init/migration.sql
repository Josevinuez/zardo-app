-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analytics" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationResult" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "shown" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PSAResult" (
    "id" SERIAL NOT NULL,
    "cardNo" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'In Queue',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PSAResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveQueue" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importIdentifier" TEXT NOT NULL,

    CONSTRAINT "ActiveQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalInventory" INTEGER NOT NULL,
    "importLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "barcode" TEXT,
    "sku" TEXT,
    "inventoryQuantity" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LastDownloadCleanup" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LastDownloadCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "customerId" TEXT NOT NULL,
    "isValidEmail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestedKeyword" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSent" (
    "id" TEXT NOT NULL,
    "lastSent" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT,

    CONSTRAINT "EmailSent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_KeywordToWishlist" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PSAResult_jobId_key" ON "PSAResult"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveQueue_importIdentifier_key" ON "ActiveQueue"("importIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "Product_importLink_key" ON "Product"("importLink");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_email_key" ON "Wishlist"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_customerId_key" ON "Wishlist"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_value_key" ON "Keyword"("value");

-- CreateIndex
CREATE INDEX "value" ON "Keyword"("value");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestedKeyword_value_key" ON "SuggestedKeyword"("value");

-- CreateIndex
CREATE INDEX "SuggestedKeyword_value_idx" ON "SuggestedKeyword"("value");

-- CreateIndex
CREATE UNIQUE INDEX "_KeywordToWishlist_AB_unique" ON "_KeywordToWishlist"("A", "B");

-- CreateIndex
CREATE INDEX "_KeywordToWishlist_B_index" ON "_KeywordToWishlist"("B");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSent" ADD CONSTRAINT "EmailSent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KeywordToWishlist" ADD CONSTRAINT "_KeywordToWishlist_A_fkey" FOREIGN KEY ("A") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KeywordToWishlist" ADD CONSTRAINT "_KeywordToWishlist_B_fkey" FOREIGN KEY ("B") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
