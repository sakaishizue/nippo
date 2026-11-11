-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "target_date" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_type_target_date_key" ON "notifications"("user_id", "type", "target_date");

