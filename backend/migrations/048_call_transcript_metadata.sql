-- +migrate Up
-- Add optional JSONB metadata column to instant_messages.
-- Used to store call-transcript payloads so the patient can review the
-- conversation from a voice or video call directly in the IM panel.
ALTER TABLE instant_messages
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
