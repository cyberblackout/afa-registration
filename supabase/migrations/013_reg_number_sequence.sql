-- Migration: 013_reg_number_sequence.sql
-- Adds a 6-char zero-padded registration number (reg_number) to replace UUID display.
-- Uses a Postgres SEQUENCE for guaranteed uniqueness.

-- 1. Create the sequence
CREATE SEQUENCE IF NOT EXISTS reg_number_seq START 1;

-- 2. Add reg_number column (nullable first for backfill)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS reg_number TEXT;

-- 3. Backfill existing rows with sequence values (zero-padded to 6 digits)
UPDATE registrations
SET reg_number = LPAD(nextval('reg_number_seq')::text, 6, '0')
WHERE reg_number IS NULL;

-- 4. Set NOT NULL and UNIQUE constraints after backfill
ALTER TABLE registrations ALTER COLUMN reg_number SET NOT NULL;
ALTER TABLE registrations ADD CONSTRAINT registrations_reg_number_unique UNIQUE (reg_number);

-- 5. Create trigger function to auto-assign reg_number on INSERT
CREATE OR REPLACE FUNCTION assign_reg_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reg_number IS NULL THEN
    NEW.reg_number := LPAD(nextval('reg_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create the trigger
DROP TRIGGER IF EXISTS trg_assign_reg_number ON registrations;
CREATE TRIGGER trg_assign_reg_number
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION assign_reg_number();
