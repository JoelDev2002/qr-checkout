-- CreateTable
CREATE TABLE `PaymentAttempt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenHash` VARCHAR(191) NOT NULL,
    `cartId` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `status` ENUM('CREATED', 'FAILED', 'APPROVED', 'SALE_CREATED', 'REFUNDED', 'REFUND_FAILED', 'UNKNOWN') NOT NULL DEFAULT 'CREATED',
    `mpOrderId` VARCHAR(191) NULL,
    `externalReference` VARCHAR(191) NOT NULL,
    `failureCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentAttempt_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `PaymentAttempt_externalReference_key`(`externalReference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaymentAttempt` ADD CONSTRAINT `PaymentAttempt_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `Cart`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAttempt` ADD CONSTRAINT `PaymentAttempt_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
