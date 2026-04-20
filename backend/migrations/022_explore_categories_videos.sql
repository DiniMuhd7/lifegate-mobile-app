-- 022_explore_categories_videos.sql
-- Extends every explore category to at least 10 videos so the category
-- filter tabs always have enough content to be useful.
-- Videos that already exist are skipped via ON CONFLICT DO NOTHING.

INSERT INTO explore_videos (id, title, description, category, duration_seconds, coins, thumbnail_color, thumbnail_icon, instructor, youtube_id, sort_order)
VALUES

  -- ─── Nutrition (6 new → total 10) ────────────────────────────────────────
  ('vid_digestive_system',
   'How Your Digestive System Works',
   'A step-by-step journey through the digestive tract showing exactly how nutrients are broken down and absorbed.',
   'Nutrition', 288, 3, '#22c55e', 'nutrition-outline', 'TED-Ed', 'Og5xAdC8EUI', 101),

  ('vid_obesity_science',
   'The Science of Obesity',
   'What actually causes obesity — hormones, environment and genetics — and why willpower alone rarely explains it.',
   'Nutrition', 308, 3, '#f97316', 'body-outline', 'TED-Ed', 'BRFh9bKFkh0', 102),

  ('vid_gut_brain_axis',
   'The Gut–Brain Connection',
   'Your gut and brain communicate constantly. Learn how diet shapes mood, memory and mental performance.',
   'Nutrition', 324, 3, '#84cc16', 'flask-outline', 'TED-Ed', 'Aobg9cCIqbo', 103),

  ('vid_fiber_importance',
   'Why Dietary Fiber Is Essential',
   'Fiber does far more than aid digestion — it sculpts your gut microbiome and cuts chronic disease risk significantly.',
   'Nutrition', 266, 3, '#65a30d', 'leaf-outline', 'TED-Ed', '_BySlqeh9WI', 104),

  ('vid_protein_sources',
   'Animal vs Plant Protein: What Science Says',
   'Compare animal and plant proteins and discover how to meet your daily protein needs on any eating style.',
   'Nutrition', 360, 3, '#a16207', 'leaf-outline', 'Hospital for Special Surgery', 'bZnRWC_XKMw', 105),

  ('vid_micronutrients',
   'Micronutrients: Vitamins & Minerals Explained',
   'What every major vitamin and mineral does in your body and the real cost of chronic deficiencies.',
   'Nutrition', 420, 3, '#eab308', 'nutrition-outline', 'Amoeba Sisters', 'Fv0MeXstdLA', 106),

  -- ─── Mental Health (7 new → total 10) ────────────────────────────────────
  ('vid_depression_explained',
   'What Is Depression?',
   'An animated explainer on the neuroscience of depression, why it happens, and how modern treatments work.',
   'Mental Health', 295, 3, '#a855f7', 'happy-outline', 'TED-Ed', 'z-IR48Mb3W0', 107),

  ('vid_anxiety_brain',
   'What Happens in Your Brain During Anxiety',
   'Discover the neuroscience of anxiety — what triggers it, how it feels physically, and evidence-based coping tools.',
   'Mental Health', 318, 3, '#8b5cf6', 'pulse-outline', 'TED-Ed', 'TFbv739Xm7I', 108),

  ('vid_grief_loss',
   'Understanding Grief and Loss',
   'What grief really looks like biologically and emotionally, and how to support yourself through painful losses.',
   'Mental Health', 274, 3, '#7c3aed', 'heart-outline', 'TED-Ed', 'Mjbv6bC1oeo', 109),

  ('vid_emotional_regulation',
   'How to Regulate Your Emotions',
   'Therapist-approved techniques to pause, process, and redirect overwhelming emotions in real time.',
   'Mental Health', 344, 4, '#9333ea', 'leaf-outline', 'Therapy in a Nutshell', 'pzSTobFtpE8', 110),

  ('vid_self_compassion',
   'The Power of Self-Compassion',
   'Research by Dr. Kristin Neff shows why self-compassion consistently outperforms self-esteem for mental wellbeing.',
   'Mental Health', 333, 3, '#c026d3', 'rose-outline', 'Kristin Neff · TEDx', 'IvtZBUSplr4', 111),

  ('vid_therapy_works',
   'How Does Therapy Actually Work?',
   'A clear explainer on the science behind CBT, DBT, and talk therapy — and how to know if you might benefit.',
   'Mental Health', 390, 4, '#7c3aed', 'chatbubble-outline', 'Psych Hub', 'LPKShJoXFBg', 112),

  ('vid_burnout_recovery',
   'Burnout: Signs, Causes & Recovery',
   'Burnout is not just tiredness — learn to recognise the warning signs and the steps that genuinely help recovery.',
   'Mental Health', 426, 4, '#6d28d9', 'battery-dead-outline', 'Big Think', 'FbcXFPFiXkA', 113),

  -- ─── Fitness (7 new → total 10) ──────────────────────────────────────────
  ('vid_sedentary_danger',
   'The Dangers of Sitting Too Much',
   'What a sedentary lifestyle does to your cardiovascular system, metabolism, and spine over years of desk work.',
   'Fitness', 278, 3, '#ef4444', 'walk-outline', 'TED-Ed', 'wUEl8KrMz14', 114),

  ('vid_how_muscles_grow',
   'How Do Muscles Grow?',
   'The cellular science of muscle hypertrophy — how resistance training causes individual fibres to rebuild bigger.',
   'Fitness', 300, 3, '#f97316', 'barbell-outline', 'TED-Ed', '2tM1LFFxeKg', 115),

  ('vid_vo2max',
   'VO₂ Max: The Best Predictor of Long-Term Health',
   'Your VO₂ max predicts longevity better than almost any other biomarker. Learn what it is and how to improve it.',
   'Fitness', 330, 3, '#dc2626', 'heart-outline', 'Institute of Human Anatomy', 'Pj_cC-J-1XM', 116),

  ('vid_hiit_science',
   'The Science Behind High-Intensity Interval Training',
   'HIIT packs maximum cardiovascular benefit into minimum time. Here is the physiology that makes it work.',
   'Fitness', 315, 3, '#b91c1c', 'barbell-outline', 'Vox', 'GFcCyOVd1S4', 117),

  ('vid_flexibility_matters',
   'Why Stretching Matters More Than You Think',
   'Flexibility determines injury risk, posture, and mobility into old age — not just gymnastics performance.',
   'Fitness', 288, 3, '#f59e0b', 'body-outline', 'TED-Ed', '1LsSAMeX5Sc', 118),

  ('vid_active_recovery',
   'Rest Days vs Active Recovery: What Science Says',
   'Light movement on off days accelerates muscle repair better than total rest — here is why.',
   'Fitness', 258, 3, '#059669', 'walk-outline', 'SciShow', '95oJFq1TqEI', 119),

  ('vid_posture_health',
   'How Bad Posture Damages Your Health',
   'Poor posture does far more than cause back pain — it also affects breathing, digestion, and long-term energy.',
   'Fitness', 292, 3, '#16a34a', 'body-outline', 'TED-Ed', 'OyK0oE5jwMY', 120),

  -- ─── Prevention (7 new → total 10) ───────────────────────────────────────
  ('vid_blood_pressure_basics',
   'Understanding Blood Pressure Numbers',
   'What systolic and diastolic mean, why hypertension is called "the silent killer", and how to control it.',
   'Prevention', 240, 3, '#0ea5e9', 'heart-outline', 'TED-Ed', 'Ab9OZsDECZw', 121),

  ('vid_cancer_prevention',
   'Lifestyle Choices That Reduce Cancer Risk',
   'How diet, exercise, sun protection, and not smoking together reduce lifetime cancer risk by up to 40%.',
   'Prevention', 349, 3, '#0284c7', 'shield-checkmark-outline', 'TED-Ed', 'WsZXFHuoByE', 122),

  ('vid_heart_disease_prev',
   'Preventing Heart Disease: What Actually Works',
   'Doctor Mike breaks down the most evidence-backed interventions for keeping your cardiovascular system healthy.',
   'Prevention', 420, 4, '#ef4444', 'heart-outline', 'Doctor Mike', 'a3B3yJRoHOo', 123),

  ('vid_diabetes_prevention',
   'How to Prevent Type 2 Diabetes',
   'Sustainable diet and activity changes that dramatically lower your risk of developing type 2 diabetes.',
   'Prevention', 308, 3, '#0891b2', 'pulse-outline', 'TED-Ed', 'UKE6WhJWDSo', 124),

  ('vid_handwashing_science',
   'The Science of Handwashing',
   'Why handwashing remains the single most effective defence against infection — and exactly how to do it.',
   'Prevention', 178, 2, '#0284c7', 'water-outline', 'TED-Ed', '3GtBhRWz5Vs', 125),

  ('vid_skin_cancer_basics',
   'Skin Cancer: How to Spot It Early',
   'UV exposure, the ABCDE rule for suspicious moles, and evidence-based screening steps everyone should know.',
   'Prevention', 220, 3, '#f97316', 'sunny-outline', 'American Cancer Society', 'EEolHi2IVGE', 126),

  ('vid_sleep_prevention',
   'How Good Sleep Prevents Chronic Disease',
   'Poor sleep drives obesity, diabetes, heart disease, and immune failure. Here is how quality sleep prevents them.',
   'Prevention', 385, 4, '#4f46e5', 'moon-outline', 'Matt Walker · TED', 'aXItOY0saMY', 127),

  -- ─── Medication (8 new → total 10) ───────────────────────────────────────
  ('vid_antibiotics_how',
   'How Antibiotics Work — and Why Resistance Develops',
   'The mechanisms by which antibiotics kill bacteria, and why overuse inevitably produces resistant superbugs.',
   'Medication', 255, 3, '#059669', 'flask-outline', 'TED-Ed', 'znnp-Ivj2ek', 128),

  ('vid_painkillers_science',
   'How Painkillers Block Pain Signals',
   'From paracetamol to opioids — the science of how different analgesics interrupt pain transmission in your nerves.',
   'Medication', 296, 3, '#16a34a', 'medkit-outline', 'TED-Ed', '9mcuIc5O-DE', 129),

  ('vid_generic_vs_brand',
   'Generic vs Brand-Name Drugs: Are They the Same?',
   'The FDA bioequivalence standard explained — and why you can usually trust generics to work just as well.',
   'Medication', 224, 3, '#0ea5e9', 'medkit-outline', 'TED-Ed', 'G9o3LFopFig', 130),

  ('vid_drug_interactions',
   'Understanding Drug Interactions',
   'How combining medications — or mixing with food, alcohol, or supplements — can change how each drug works.',
   'Medication', 310, 4, '#ef4444', 'warning-outline', 'Pharmacist Tips', 'szqrHljBLQA', 131),

  ('vid_vaccine_types',
   'The Different Types of Vaccines Explained',
   'mRNA, live-attenuated, inactivated: understand how each vaccine platform trains your immune system differently.',
   'Medication', 341, 4, '#0284c7', 'shield-checkmark-outline', 'Kurzgesagt', 'rb7TVW77ZCs', 132),

  ('vid_adherence_matters',
   'Why Medication Adherence Changes Everything',
   'Missing doses is the #1 reason treatments fail. Practical strategies to stay on track with any prescription.',
   'Medication', 214, 3, '#16a34a', 'checkmark-circle-outline', 'Medical Centric', 'ifxMTFCMnRY', 133),

  ('vid_otc_safety',
   'Staying Safe with Over-the-Counter Medicines',
   'Which OTC drugs are safe to combine, which combinations to avoid, and when symptoms need a doctor.',
   'Medication', 302, 3, '#0891b2', 'medkit-outline', 'TED-Ed', 'Zjbm9YXMHOk', 134),

  ('vid_antimicrobial_res',
   'The Antibiotic Resistance Crisis',
   'Drug-resistant bacteria kill over a million people yearly. What patients and prescribers can do to slow the spread.',
   'Medication', 288, 3, '#dc2626', 'bug-outline', 'World Health Organization', 'Rb4_AFQE2V0', 135),

  -- ─── Maternal Health (7 new → total 10) ──────────────────────────────────
  ('vid_fetal_development',
   'Stages of Fetal Development',
   'Follow the journey from fertilisation to birth and see how every organ forms and matures week by week.',
   'Maternal Health', 318, 3, '#ec4899', 'rose-outline', 'TED-Ed', 'pIv7-Ir0Wog', 136),

  ('vid_breastfeeding_science',
   'The Science of Breastfeeding',
   'What is in breast milk, how it adapts to newborn needs, and the health benefits for both mother and infant.',
   'Maternal Health', 402, 4, '#f472b6', 'heart-outline', 'TED-Ed', 'Ywui7C0LRLU', 137),

  ('vid_gestational_diabetes',
   'Gestational Diabetes: What You Need to Know',
   'How gestational diabetes develops, how it is diagnosed, and lifestyle choices that protect mother and baby.',
   'Maternal Health', 325, 3, '#db2777', 'pulse-outline', 'Medical Centric', 'M14Rm_3w0Ac', 138),

  ('vid_preeclampsia',
   'Preeclampsia: Signs, Risks & Management',
   'High blood pressure in pregnancy is dangerous — recognise the warning signs and understand the treatments available.',
   'Maternal Health', 344, 4, '#e11d48', 'warning-outline', 'Doctor Mike', 'pBHNqXrPiAc', 139),

  ('vid_exercise_pregnancy',
   'Safe Exercise During Pregnancy',
   'OB-GYN guidelines on which exercises are beneficial, which to avoid, and why staying active helps mother and baby.',
   'Maternal Health', 278, 3, '#f9a8d4', 'barbell-outline', 'What to Expect', 'v9IIMGN3vok', 140),

  ('vid_newborn_first_days',
   'Newborn Care: The First 48 Hours',
   'What to expect when you bring your baby home — feeding, safe sleep, umbilical cord care, and red-flag symptoms.',
   'Maternal Health', 396, 4, '#db2777', 'rose-outline', 'Cincinnati Children''s', '3h_5UMlnVKw', 141),

  ('vid_maternal_nutrition',
   'Nutrition During Pregnancy',
   'Critical nutrients for a healthy pregnancy, foods to avoid, and how to build a balanced prenatal diet safely.',
   'Maternal Health', 312, 3, '#ec4899', 'nutrition-outline', 'PregnancyChat', 'QiNEIoHoFuE', 142),

  -- ─── Public Health (7 new → total 10) ────────────────────────────────────
  ('vid_epidemics_spread',
   'How Epidemics Spread — and How We Stop Them',
   'Track how a single infection becomes a global outbreak, and the epidemiological models used to contain it.',
   'Public Health', 267, 3, '#0891b2', 'earth-outline', 'TED-Ed', 'vSFd7FxaPNk', 143),

  ('vid_herd_immunity',
   'Herd Immunity Explained',
   'What herd immunity is, how it protects vulnerable people, and why vaccination rates must hit a critical threshold.',
   'Public Health', 258, 3, '#0e7490', 'shield-checkmark-outline', 'Vox', 'jzSRENsZTBk', 144),

  ('vid_social_determinants',
   'Social Determinants of Health',
   'Why your postcode predicts your health as much as your doctor — poverty, housing, and education all matter.',
   'Public Health', 412, 4, '#0284c7', 'people-outline', 'RWJF', '1O8j33v-XLc', 145),

  ('vid_clean_water_health',
   'Clean Water and Global Health',
   'The profound impact of safe drinking water on child survival, disease burden, and community-level wellbeing.',
   'Public Health', 243, 3, '#06b6d4', 'water-outline', 'TED-Ed', 'oiIe6hWAb3o', 146),

  ('vid_ncds_global',
   'The Global Burden of Non-Communicable Disease',
   'How heart disease, cancer, and diabetes became the world''s biggest killers, and what policy changes reduce them.',
   'Public Health', 388, 4, '#0891b2', 'earth-outline', 'WHO', 'TzJ0M5ZKBVY', 147),

  ('vid_mental_health_stigma',
   'Breaking Down Mental Health Stigma',
   'Where mental health stigma comes from, how it prevents people from seeking help, and what communities can do.',
   'Public Health', 314, 3, '#7c3aed', 'people-outline', 'Time to Change', 'j3xPYPCfJMI', 148),

  ('vid_climate_health',
   'Climate Change and Human Health',
   'How rising temperatures, extreme weather, and air pollution are driving disease and what public health must do.',
   'Public Health', 436, 4, '#0ea5e9', 'earth-outline', 'Lancet Countdown', 'm1tT-F_FLmU', 149),

  -- ─── Primary Care (7 new → total 10) ─────────────────────────────────────
  ('vid_when_see_doctor',
   'When Should You Actually See a Doctor?',
   'A guide to which symptoms need urgent attention, which can wait, and how not to over- or under-use your GP.',
   'Primary Care', 312, 3, '#16a34a', 'medical-outline', 'Doctor Mike', 'tqh6CXFHTAM', 150),

  ('vid_talk_to_doctor',
   'How to Talk to Your Doctor Effectively',
   'Practical techniques — symptom diaries, prepared questions, and assertive communication — that improve every consult.',
   'Primary Care', 284, 3, '#15803d', 'chatbubble-outline', 'Cleveland Clinic', 'rkuXvWwYRro', 151),

  ('vid_blood_tests_explained',
   'Understanding Your Blood Test Results',
   'What CBC, metabolic panels, lipid profiles, and HbA1c actually measure — and the ranges that should concern you.',
   'Primary Care', 480, 4, '#059669', 'flask-outline', 'Doctor Mike', '3OxNz_3Wy0I', 152),

  ('vid_chronic_condition_mgmt',
   'Managing a Chronic Condition Day-to-Day',
   'Evidence-based self-management strategies for living well with diabetes, hypertension, asthma, or arthritis.',
   'Primary Care', 368, 4, '#16a34a', 'pulse-outline', 'Mighty Health', 'lEhBJiKX_gY', 153),

  ('vid_telehealth_guide',
   'Getting the Most from Telehealth Appointments',
   'How virtual consultations work, what to prepare, and how to communicate symptoms clearly over video.',
   'Primary Care', 252, 3, '#0ea5e9', 'videocam-outline', 'American Family Physician', 'OyRLqGrfKjo', 154),

  ('vid_preventive_screening',
   'Which Health Screenings Do You Actually Need?',
   'Age-based screening recommendations for cancer, diabetes, cholesterol, and blood pressure — backed by evidence.',
   'Primary Care', 344, 4, '#0284c7', 'shield-checkmark-outline', 'Dr. Neeraj Goel', 'BjSPz9b0pXo', 155),

  ('vid_doctor_patient_relationship',
   'Building a Good Doctor–Patient Relationship',
   'Trust, honesty, and communication skills that make every clinical encounter safer and more effective.',
   'Primary Care', 296, 3, '#15803d', 'heart-outline', 'Stanford Medicine', 's0bYJyABHOI', 156)

ON CONFLICT (id) DO NOTHING;
