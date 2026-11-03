-- CreateTable
CREATE TABLE "visit" (
    "id" SERIAL NOT NULL,
    "viewer" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);
