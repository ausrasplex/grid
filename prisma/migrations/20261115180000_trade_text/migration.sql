-- Trades become text (blocks/companies/trades.ts), so new trades need no
-- migration. Converted in place: every business keeps the trade it had.
ALTER TABLE "Company" ALTER COLUMN "tradeProfile" TYPE TEXT USING "tradeProfile"::text;

DROP TYPE "TradeProfile";
