-- Migration 009: Admin system support
-- Adds index for fast admin-role lookups and an admin_actions audit table.

-- Fast lookup of admin users by role (the role column already exists on users).
CREATE INDEX IF NOT EXISTS idx_users_admin_role
    ON users(id)
    WHERE role = 'admin';

-- Admin action audit log — tracks every privileged action taken by an admin.
CREATE TABLE IF NOT EXISTS admin_actions (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action       VARCHAR(100) NOT NULL,   -- e.g. "case.status_override"
    resource     VARCHAR(50)  NOT NULL,   -- e.g. "diagnosis"
    resource_id  UUID,                    -- the affected record (optional)
    details      JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
    ON admin_actions(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_resource
    ON admin_actions(resource, resource_id);
