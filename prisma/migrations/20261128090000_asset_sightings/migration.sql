-- Assets part 5: "Do you still have it?" after this many days.
ALTER TABLE "AssetSettings" ADD COLUMN "stillGotItDays" INTEGER NOT NULL DEFAULT 14;
