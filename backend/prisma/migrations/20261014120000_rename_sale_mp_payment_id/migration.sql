-- Rename the external payment reference on Sale to match Mercado Pago.
ALTER TABLE `Sale` CHANGE `culqiChargeId` `mpPaymentId` VARCHAR(191) NULL;
