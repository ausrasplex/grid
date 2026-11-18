-- Materials markup per quote, and whether each line is labour or material.
ALTER TABLE "Quote" ADD COLUMN "materialsMarkup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "materialsMarkupPct" DECIMAL(7,2);

ALTER TABLE "QuoteLine" ADD COLUMN "kind" "PriceItemKind";

-- Lines already added from the price book take their item's kind.
UPDATE "QuoteLine" AS line SET "kind" = item."kind"
FROM "PriceItem" AS item
WHERE line."priceItemId" = item."id";
