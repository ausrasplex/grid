-- Scheduling Block part 1 (docs/scheduling-block.md): visits, booking settings; core leave records (time off).
-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'PERSONAL', 'COMPASSIONATE', 'LONG_SERVICE', 'PARENTAL', 'COMMUNITY_SERVICE', 'UNPAID', 'RDO', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DayPart" AS ENUM ('WHOLE', 'MORNING', 'AFTERNOON', 'HOURS');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('BOOKED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL DEFAULT 'ANNUAL',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "firstDayPart" "DayPart" NOT NULL DEFAULT 'WHOLE',
    "lastDayPart" "DayPart" NOT NULL DEFAULT 'WHOLE',
    "firstDayHours" DECIMAL(4,2),
    "lastDayHours" DECIMAL(4,2),
    "note" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'APPROVED',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "isTentative" BOOLEAN NOT NULL DEFAULT false,
    "status" "VisitStatus" NOT NULL DEFAULT 'BOOKED',
    "assignedUserId" TEXT,
    "notes" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingSettings" (
    "companyId" TEXT NOT NULL,
    "defaultVisitLengthMinutes" INTEGER NOT NULL DEFAULT 120,
    "dayStartsAt" TEXT NOT NULL DEFAULT '07:00',
    "dayEndsAt" TEXT NOT NULL DEFAULT '15:30',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "SchedulingUserSettings" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyVisitWarningLimit" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingUserSettings_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateIndex
CREATE INDEX "Leave_companyId_userId_startsOn_idx" ON "Leave"("companyId", "userId", "startsOn");

-- CreateIndex
CREATE INDEX "Leave_companyId_startsOn_idx" ON "Leave"("companyId", "startsOn");

-- CreateIndex
CREATE INDEX "Visit_companyId_startsAt_idx" ON "Visit"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "Visit_companyId_assignedUserId_startsAt_idx" ON "Visit"("companyId", "assignedUserId", "startsAt");

-- CreateIndex
CREATE INDEX "Visit_projectId_idx" ON "Visit"("projectId");

