-- CreateTable
CREATE TABLE "OrderBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "note" TEXT,
    "optionGroups" TEXT NOT NULL DEFAULT '[]',
    "images" TEXT NOT NULL DEFAULT '[]',
    "video" TEXT,
    "shopifyDraftOrderId" TEXT,
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "checkoutUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "optionGroups" TEXT NOT NULL DEFAULT '[]',
    "images" TEXT DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
