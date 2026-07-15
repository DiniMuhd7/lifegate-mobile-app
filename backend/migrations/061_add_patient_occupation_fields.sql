-- 061: Store patient occupation category and student academic details.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS occupation_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS department VARCHAR(255),
  ADD COLUMN IF NOT EXISTS faculty VARCHAR(255),
  ADD COLUMN IF NOT EXISTS academic_level VARCHAR(50);
