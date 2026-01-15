-- CreateTable
CREATE TABLE "Auth" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "account_pw" TEXT NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "Auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_phone" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isChief" BOOLEAN NOT NULL DEFAULT false,
    "total_hours" DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "hours" DOUBLE PRECISION,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Current" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "cur_account" TEXT NOT NULL,
    "next_account" TEXT NOT NULL,
    "selected_account" TEXT NOT NULL,
    "isAdminMode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Current_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "next_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auth_account_id_key" ON "Auth"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_account_id_key" ON "Account"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_account_name_key" ON "Account"("account_name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_day_time_key" ON "Order"("day", "time");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Auth"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
