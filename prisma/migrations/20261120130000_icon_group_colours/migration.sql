-- CreateTable
CREATE TABLE "IconGroupColour" (
    "companyId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IconGroupColour_pkey" PRIMARY KEY ("companyId","trade")
);

