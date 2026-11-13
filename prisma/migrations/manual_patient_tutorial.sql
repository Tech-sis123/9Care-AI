-- Guided tour of the app (shown once per tour version).
-- Run once in Supabase SQL Editor (or any Postgres client) BEFORE deploying the backend.
-- Safe to re-run: uses IF NOT EXISTS.

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "tutorial_seen_at" TIMESTAMP(3);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "tutorial_skipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "tutorial_version" INTEGER;
