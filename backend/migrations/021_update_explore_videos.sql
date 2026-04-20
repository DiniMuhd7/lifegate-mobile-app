-- 021_update_explore_videos.sql
-- Replace the initial hand-picked seed catalogue with videos sourced via the
-- YouTube Data API v3.  Old entries are deleted first (explore_video_rewards
-- cascade-deletes via the FK) and the new set is inserted.

DELETE FROM explore_videos WHERE id IN (
  'vid_blood_pressure',
  'vid_mediterranean_diet',
  'vid_exercise_brain',
  'vid_stress_anxiety',
  'vid_vaccines',
  'vid_gut_health',
  'vid_sleep_hygiene',
  'vid_medication_labels',
  'vid_diabetes_prevention',
  'vid_mindfulness',
  'vid_hydration',
  'vid_walking_benefits',
  'vid_medication_safety'
);

INSERT INTO explore_videos (id, title, description, category, duration_seconds, coins, thumbnail_color, thumbnail_icon, instructor, youtube_id, sort_order)
VALUES
  -- Nutrition
  ('vid_nutrition_life',     'Nutrition for a Healthy Life',           'How everyday food choices affect your body at the cellular level and practical steps to eat for longevity.',                        'Nutrition',     266,  3, '#16a34a', 'nutrition-outline',        'Alliance for Aging Research', 'c06dTj0v0sM', 1),
  ('vid_balanced_diet',      'Balanced Diet Explained',                'Understand all the major food groups, why each one matters, and how to build meals that cover your daily needs.',                   'Nutrition',     299,  3, '#f59e0b', 'nutrition-outline',        'FuseSchool',                  'NqV1Ig4_nfI', 2),
  ('vid_food_brain',         'How Food Affects Your Brain',            'Your brain runs on what you eat. Discover which nutrients sharpen focus and which damage cognitive function.',                      'Nutrition',     293,  3, '#f97316', 'flask-outline',            'TED-Ed',                      'xyQY8a-ng6g', 3),
  ('vid_eating_tips',        '3 Simple Healthy Eating Tips',           'Three science-backed tricks to make healthier food choices without overhauling your whole lifestyle.',                              'Nutrition',     60,   2, '#65a30d', 'leaf-outline',             'BBC Ideas',                   '-YyGQd-kQGU', 4),
  -- Mental Health
  ('vid_stress_adolescents', 'Understanding Stress & Anxiety',         'What stress and anxiety actually are, how they affect your body, and when to seek professional support.',                          'Mental Health', 89,   2, '#7c3aed', 'happy-outline',            'NIMH',                        'wr4N-SdekqY', 5),
  ('vid_daily_stress_habits','6 Daily Habits to Beat Stress',          'Six small, evidence-backed daily actions — from journaling to breathing — that measurably reduce anxiety over time.',              'Mental Health', 384,  4, '#8b5cf6', 'heart-outline',            'Psych2Go',                    'o18I23HCQtE', 6),
  ('vid_mindfulness_practice','How to Practice Mindfulness',           'A clear, step-by-step introduction to mindfulness from a psychologist — no experience or equipment needed.',                       'Mental Health', 224,  3, '#4f46e5', 'leaf-outline',             'Psych Hub',                   'bLpChrgS0AY', 7),
  -- Fitness
  ('vid_start_exercising',   'What Happens When You Start Exercising', 'An animated look at real-time changes in your muscles, heart, lungs, and brain the moment you begin working out.',                'Fitness',       546,  4, '#ea580c', 'barbell-outline',          'Practical Wisdom',            'KEhbYNmY3N4', 8),
  ('vid_exercise_benefits',  'Top 10 Benefits of Exercise',            'Doctor Mike Hansen walks through the ten strongest science-backed reasons why regular exercise is non-negotiable.',                'Fitness',       492,  4, '#dc2626', 'body-outline',             'Doctor Mike Hansen',          'XqTcye_acTI', 9),
  ('vid_cardio_vs_strength', 'Cardio vs. Strength Training',           'Which is better for your health and longevity? Oncology experts break down what the research actually shows.',                    'Fitness',       66,   2, '#10b981', 'walk-outline',             'UT MD Anderson',              'YvrKIQ_Tbsk', 10),
  -- Prevention
  ('vid_prevention_levels',  'Levels of Disease Prevention',           'Primary, secondary, and tertiary prevention explained — how public health stops disease before it starts.',                       'Prevention',    419,  4, '#0284c7', 'shield-checkmark-outline', 'Level Up RN',                 'wAYlurDlGAI', 11),
  ('vid_checkup_myths',      'Health Check-Up Myths Debunked',         'A surgeon separates fact from fiction on preventive screenings — who really needs them and how often.',                           'Prevention',    117,  2, '#0ea5e9', 'pulse-outline',            'Dr. Neeraj Goel',             'eV5gz_p53ZE', 12),
  ('vid_annual_checkup',     'What to Expect at Your Annual Checkup',  'A walkthrough of what doctors actually do during a yearly physical and why each part of the exam matters.',                       'Prevention',    84,   2, '#0891b2', 'medical-outline',          'Remix Medical',               'q55RMYf6lAU', 13),
  -- Medication
  ('vid_medication_safety',  'Medication Safety Essentials',           'How to take, store, and dispose of medications safely — including what to do when you miss a dose.',                              'Medication',       219,  3, '#059669', 'medkit-outline',           'Medical Centric',          'iQozgr7XnoY', 14),
  ('vid_medication_admin',   'Safe Medication Administration',         'Pharmacology basics: the five rights of medication administration, common errors, and how to read a prescription.',               'Medication',       674,  4, '#16a34a', 'flask-outline',            'Level Up RN',              'pWlOTAe97G4', 15),
  -- Maternal Health
  ('vid_prenatal_care',      'Prenatal Care: All Three Trimesters',    'A thorough guide to what happens at your 1st, 2nd, and 3rd trimester check-ups and why each visit matters.',                     'Maternal Health',  501,  4, '#db2777', 'rose-outline',             'Level Up RN',              'wt9-6VWbfHI', 16),
  ('vid_antenatal_what',     'What is Antenatal Care?',                'A clear explanation of antenatal visits — what to expect, what is checked, and why early care saves lives.',                     'Maternal Health',  252,  3, '#ec4899', 'heart-outline',            'Medical Centric',          'vIIcKmKNkk8', 17),
  ('vid_postpartum_depression','Baby Blues vs. Postpartum Depression', 'An ER physician explains the difference between normal post-birth emotional shifts and postpartum depression.',                  'Maternal Health',  142,  2, '#f472b6', 'happy-outline',            'Jeff Yoo MD',              'roO0PbRlfKU', 18),
  -- Public Health
  ('vid_what_is_public_health','What is Public Health?',              'A concise overview of what public health professionals do, why it matters, and how it keeps communities safe.',                   'Public Health',    334,  3, '#0891b2', 'earth-outline',            'Let''s Learn Public Health','t_eWESXTnic', 19),
  ('vid_infectious_disease_control','Controlling Infectious Diseases', 'The basic principles of how public health controls the spread of infectious diseases in a population.',                          'Public Health',    320,  3, '#0e7490', 'shield-checkmark-outline', 'Let''s Learn Public Health','2JWku3Kjpq0', 20),
  ('vid_communicable_diseases','Communicable Diseases: What, Why & How','National Institute explains how communicable diseases spread, how to prevent transmission, and what surveillance does.',        'Public Health',    325,  3, '#0284c7', 'bug-outline',              'NICD South Africa',        'LBkXQ_mBO3Q', 21),
  -- Primary Care
  ('vid_primary_care_importance','Why You Need a Primary Care Physician','How having a regular family doctor leads to better long-term health outcomes and earlier disease detection.',                  'Primary Care',     91,   2, '#16a34a', 'home-outline',             'Dignity Health',           'ZPHLtULjL18', 22),
  ('vid_first_primary_visit','How to Prepare for Your First Primary Care Visit','What documents to bring, questions to ask, and what to expect at your first appointment with a new doctor.',           'Primary Care',     198,  3, '#15803d', 'clipboard-outline',        'Dena Goldberg MS CGC',     'ilr2WF0EJqw', 23),
  ('vid_primary_care_questions','Top 3 Questions to Ask Your Primary Care Doctor','A doctor walks through the three most impactful questions patients should raise at every routine visit.',             'Primary Care',     587,  4, '#059669', 'chatbubble-outline',       'Mighty Health',            'BhKU6uqzXFA', 24)
ON CONFLICT (id) DO NOTHING;
