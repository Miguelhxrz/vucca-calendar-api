/*
  Warnings:

  - You are about to drop the column `status` on the `Season` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Season` table. All the data in the column will be lost.
  - You are about to drop the column `yearEnd` on the `Season` table. All the data in the column will be lost.
  - You are about to drop the column `yearStart` on the `Season` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[league]` on the table `Season` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `startDate` to the `Season` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Season_league_yearStart_yearEnd_key` ON `Season`;

-- AlterTable
ALTER TABLE `Season` DROP COLUMN `status`,
    DROP COLUMN `title`,
    DROP COLUMN `yearEnd`,
    DROP COLUMN `yearStart`,
    ADD COLUMN `isFinished` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `startDate` DATETIME(3) NOT NULL,
    MODIFY `league` VARCHAR(191) NOT NULL,
    MODIFY `totalWeeks` INTEGER NOT NULL DEFAULT 16;

-- CreateIndex
CREATE UNIQUE INDEX `Season_league_key` ON `Season`(`league`);
