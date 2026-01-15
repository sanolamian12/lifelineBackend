-- CreateTable
CREATE TABLE "OrderBackup" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "next_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderBackup_pkey" PRIMARY KEY ("id")
);
