-- DropIndex
DROP INDEX `Season_league_key` ON `Season`;

-- AlterTable
ALTER TABLE `Season` MODIFY `totalWeeks` INTEGER NOT NULL DEFAULT 1;
