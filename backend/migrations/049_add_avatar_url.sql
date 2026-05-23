-- Migration 049: add avatar_url column to users
-- Stores an optional HTTPS URL to the user's profile photo.
-- Used by physician profiles; returned by the calls API so the caller can
-- show the physician's actual photo in the call screen instead of initials.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
