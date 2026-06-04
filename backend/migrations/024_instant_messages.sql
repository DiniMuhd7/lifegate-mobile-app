-- +migrate Up
-- Instant messaging between patients and assigned physicians for a specific diagnosis/case.
CREATE TABLE IF NOT EXISTS instant_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diagnosis_id  UUID        NOT NULL,
    sender_id     UUID        NOT NULL,
    sender_role   VARCHAR(20) NOT NULL CHECK (sender_role IN ('user', 'professional')),
    sender_name   TEXT        NOT NULL DEFAULT '',
    content       TEXT        NOT NULL CHECK (char_length(trim(content)) > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_instant_messages_diagnosis_id ON instant_messages (diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_instant_messages_sender_id    ON instant_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_instant_messages_created_at   ON instant_messages (diagnosis_id, created_at ASC);
