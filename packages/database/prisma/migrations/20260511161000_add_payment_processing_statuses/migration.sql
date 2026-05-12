-- Add intermediate payment statuses for Brick flow
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'processing_payment';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'pending_payment';
