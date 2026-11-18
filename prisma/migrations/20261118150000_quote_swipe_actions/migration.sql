-- What swiping a quote line left or right does (set per business).
ALTER TABLE "TaxSettings" ADD COLUMN "swipeLeft" TEXT NOT NULL DEFAULT 'DELETE',
ADD COLUMN "swipeRight" TEXT NOT NULL DEFAULT 'DUPLICATE';
