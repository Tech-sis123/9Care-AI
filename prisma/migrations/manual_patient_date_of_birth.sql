-- Patients' date of birth (age is now worked out from it).
-- Run once in Supabase SQL Editor (or any Postgres client) BEFORE deploying the backend.
-- Safe to re-run: uses IF NOT EXISTS.

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;
