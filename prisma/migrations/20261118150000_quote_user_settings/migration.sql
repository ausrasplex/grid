-- Each person's own quote screen settings (what swiping a line does), per business.
CREATE TABLE "QuoteUserSettings" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "swipeLeft" TEXT NOT NULL DEFAULT 'DELETE',
    "swipeRight" TEXT NOT NULL DEFAULT 'DUPLICATE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteUserSettings_pkey" PRIMARY KEY ("companyId","userId")
);
