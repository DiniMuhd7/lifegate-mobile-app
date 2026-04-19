-- 020_explore_videos.sql
-- Catalogue of health education videos shown in the patient Explore tab.
-- Rewards (Lifecoins) earned by watching are tracked per-user per day in
-- explore_video_rewards.

CREATE TABLE IF NOT EXISTS explore_videos (
    id               TEXT        PRIMARY KEY,
    title            TEXT        NOT NULL,
    description      TEXT        NOT NULL,
    category         TEXT        NOT NULL,
    duration_seconds INTEGER     NOT NULL DEFAULT 0,
    coins            INTEGER     NOT NULL DEFAULT 3,
    thumbnail_color  TEXT        NOT NULL DEFAULT '#059669',
    thumbnail_icon   TEXT        NOT NULL DEFAULT 'play-circle-outline',
    instructor       TEXT        NOT NULL DEFAULT '',
    youtube_id       TEXT        NOT NULL,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order       INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS explore_video_rewards (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id     TEXT        NOT NULL REFERENCES explore_videos(id) ON DELETE CASCADE,
    rewarded_on  DATE        NOT NULL DEFAULT CURRENT_DATE,
    coins_earned INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, video_id, rewarded_on)
);

CREATE INDEX IF NOT EXISTS idx_explore_video_rewards_user_date
    ON explore_video_rewards(user_id, rewarded_on);

-- Seed initial catalogue
INSERT INTO explore_videos (id, title, description, category, duration_seconds, coins, thumbnail_color, thumbnail_icon, instructor, youtube_id, sort_order)
VALUES
  ('vid_blood_pressure',   'Understanding Blood Pressure',        'Learn what your blood pressure numbers mean and simple lifestyle changes that keep your heart healthy.',                          'Prevention',    240,  3, '#ef4444', 'heart-outline',              'TED-Ed',                   'nnpGWuD3qGk',  1),
  ('vid_mediterranean_diet','Why Yo-Yo Dieting Backfires',        'Neuroscientist Sandra Aamodt explains why diets fail long-term and what sustainable healthy eating looks like.',               'Nutrition',     1012, 4, '#f59e0b', 'nutrition-outline',          'Sandra Aamodt · TED',      'YFnMzqL0wEE',  2),
  ('vid_exercise_brain',   'What Exercise Does to Your Brain',    'Exercise is one of the most transformative things you can do for your brain — learn exactly why.',                             'Fitness',       853,  4, '#10b981', 'barbell-outline',            'Wendy Suzuki · TED',       'BHY0FxzoKZE',  3),
  ('vid_stress_anxiety',   'Managing Stress & Anxiety',           'Evidence-based techniques — deep breathing, grounding, and cognitive reframing — for daily stress.',                           'Mental Health', 855,  4, '#8b5cf6', 'happy-outline',              'Kelly McGonigal · TED',    'RcGyVTAoXEU',  4),
  ('vid_vaccines',         'How Vaccines Work',                   'A clear explanation of how vaccines train your immune system and why they are essential for public health.',                    'Prevention',    285,  3, '#0ea5e9', 'shield-checkmark-outline',   'TED-Ed',                   'dVnPb8heKBM',  5),
  ('vid_gut_health',       'Your Gut Microbiome Explained',       'Discover how the trillions of microbes in your gut affect immunity, mood, and digestion.',                                     'Nutrition',     285,  3, '#f97316', 'flask-outline',              'TED-Ed',                   '1sISguPDlhY',  6),
  ('vid_sleep_hygiene',    'Why Sleep is Your Superpower',        'Why quality sleep matters and the proven habits that help you fall asleep faster and wake refreshed.',                          'Mental Health', 1143, 4, '#4f46e5', 'moon-outline',               'Matt Walker · TED',        'dqONk48l5vY',  7),
  ('vid_medication_labels','How Drugs Affect the Brain',          'A clear look at how different medications and substances interact with brain chemistry and why dosage matters.',                'Medication',    300,  3, '#059669', 'medkit-outline',             'TED-Ed',                   '_ZX0b5ykRFI',  8),
  ('vid_diabetes_prevention','Understanding Type 2 Diabetes',     'Simple diet and activity changes that significantly lower your risk of developing type 2 diabetes.',                           'Prevention',    300,  3, '#0284c7', 'pulse-outline',              'TED-Ed',                   'UKE6WhJWDSo',  9),
  ('vid_mindfulness',      'Introduction to Mindfulness',         'A practical beginner''s guide to mindfulness meditation and how just 5 minutes daily reduces stress.',                          'Mental Health', 482,  3, '#7c3aed', 'leaf-outline',               'Headspace',                'ol2yKchPjY0',  10),
  ('vid_hydration',        'How Much Water Do You Actually Need?','The science of hydration — how water affects every organ and the signs you are not drinking enough.',                           'Nutrition',     266,  3, '#0891b2', 'water-outline',              'TED-Ed',                   'W_HxoFRMdDw',  11),
  ('vid_walking_benefits', '30 Minutes of Walking a Day',         'What happens to your body and mind when you simply walk 30 minutes every day — backed by science.',                            'Fitness',       420,  3, '#dc2626', 'walk-outline',               'Dr. Mike Evans',           'aUaInS6HIGo',  12),
  ('vid_medication_safety','Medication Safety at Home',           'How to store, take, and dispose of medications safely — and when to call your doctor.',                                        'Medication',    312,  3, '#059669', 'medkit-outline',             'Mayo Clinic',              'ifxMTFCMnRY',  13)
ON CONFLICT (id) DO NOTHING;
