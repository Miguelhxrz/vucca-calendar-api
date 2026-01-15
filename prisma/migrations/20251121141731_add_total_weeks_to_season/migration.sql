-- CreateTable
CREATE TABLE `Umpire` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Umpire_lastName_firstName_idx`(`lastName`, `firstName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Season` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `league` VARCHAR(10) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `yearStart` INTEGER NOT NULL,
    `yearEnd` INTEGER NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `totalWeeks` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Season_league_yearStart_yearEnd_key`(`league`, `yearStart`, `yearEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Assignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `seasonId` INTEGER NOT NULL,
    `league` VARCHAR(10) NOT NULL,
    `weekNumber` INTEGER NOT NULL,
    `cellIndex` INTEGER NOT NULL,
    `rowIndex` INTEGER NOT NULL,
    `colIndex` INTEGER NOT NULL,
    `dayName` VARCHAR(16) NOT NULL,
    `dateStr` VARCHAR(10) NOT NULL,
    `stadiumCity` VARCHAR(80) NOT NULL,
    `stadiumName` VARCHAR(120) NOT NULL,
    `localTeam` VARCHAR(40) NOT NULL,
    `visitorsTeam` VARCHAR(40) NOT NULL,
    `gameNumber` VARCHAR(10) NULL,
    `gameNumber2` VARCHAR(10) NULL,
    `gameTime` VARCHAR(20) NULL,
    `gameTime2` VARCHAR(20) NULL,
    `gameStatus` VARCHAR(16) NOT NULL,
    `isDoubleGame` BOOLEAN NOT NULL DEFAULT false,
    `isFinalGame` BOOLEAN NOT NULL DEFAULT false,
    `umpires` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Assignment_seasonId_weekNumber_idx`(`seasonId`, `weekNumber`),
    INDEX `Assignment_league_weekNumber_idx`(`league`, `weekNumber`),
    UNIQUE INDEX `Assignment_seasonId_weekNumber_cellIndex_key`(`seasonId`, `weekNumber`, `cellIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
