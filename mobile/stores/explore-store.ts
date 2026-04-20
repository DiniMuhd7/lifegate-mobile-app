import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from 'services/api';

const STORAGE_KEY = 'explore_store_v1';

// ── Types ──────────────────────────────────────────────────────────────────

export type VideoCategory =
  | 'Nutrition'
  | 'Mental Health'
  | 'Fitness'
  | 'Prevention'
  | 'Medication'
  | 'Maternal Health'
  | 'Public Health'
  | 'Primary Care';

export interface ExploreVideo {
  id: string;
  title: string;
  description: string;
  category: VideoCategory;
  durationSeconds: number;   // approximate video length in seconds
  coins: number;
  thumbnailColor: string;    // gradient accent (shown while thumbnail loads)
  thumbnailIcon: string;     // Ionicons name fallback icon
  instructor: string;
  youtubeId: string;           // YouTube video ID (11-character string)
}

export interface VideoProgress {
  videoId: string;
  rewardedDate: string | null;  // YYYY-MM-DD when coins were claimed
}

// ── Daily cap ─────────────────────────────────────────────────────────────

// Default cap — overridden by whatever the server returns.
export const DAILY_VIDEO_CAP = 10;

// ── Seed catalogue ────────────────────────────────────────────────────────

export const SEED_VIDEOS: ExploreVideo[] = [
  // ── Nutrition ─────────────────────────────────────────────────────────
  {
    id: 'vid_nutrition_life',
    title: 'Nutrition for a Healthy Life',
    description: 'How everyday food choices affect your body at the cellular level and practical steps to eat for longevity.',
    category: 'Nutrition',
    durationSeconds: 266,
    coins: 3,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'Alliance for Aging Research',
    youtubeId: 'c06dTj0v0sM',
  },
  {
    id: 'vid_balanced_diet',
    title: 'Balanced Diet Explained',
    description: 'Understand all the major food groups, why each one matters, and how to build meals that cover your daily needs.',
    category: 'Nutrition',
    durationSeconds: 299,
    coins: 3,
    thumbnailColor: '#f59e0b',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'FuseSchool',
    youtubeId: 'NqV1Ig4_nfI',
  },
  {
    id: 'vid_food_brain',
    title: 'How Food Affects Your Brain',
    description: 'Your brain runs on what you eat. Discover which nutrients sharpen focus and which damage cognitive function.',
    category: 'Nutrition',
    durationSeconds: 293,
    coins: 3,
    thumbnailColor: '#f97316',
    thumbnailIcon: 'flask-outline',
    instructor: 'TED-Ed',
    youtubeId: 'xyQY8a-ng6g',
  },
  {
    id: 'vid_eating_tips',
    title: '3 Simple Healthy Eating Tips',
    description: 'Three science-backed tricks to make healthier food choices without overhauling your whole lifestyle.',
    category: 'Nutrition',
    durationSeconds: 60,
    coins: 2,
    thumbnailColor: '#65a30d',
    thumbnailIcon: 'leaf-outline',
    instructor: 'BBC Ideas',
    youtubeId: '-YyGQd-kQGU',
  },
  // ── Mental Health ─────────────────────────────────────────────────────
  {
    id: 'vid_stress_adolescents',
    title: 'Understanding Stress & Anxiety',
    description: 'What stress and anxiety actually are, how they affect your body, and when to seek professional support.',
    category: 'Mental Health',
    durationSeconds: 89,
    coins: 2,
    thumbnailColor: '#7c3aed',
    thumbnailIcon: 'happy-outline',
    instructor: 'NIMH',
    youtubeId: 'wr4N-SdekqY',
  },
  {
    id: 'vid_daily_stress_habits',
    title: '6 Daily Habits to Beat Stress',
    description: 'Six small, evidence-backed daily actions — from journaling to breathing — that measurably reduce anxiety over time.',
    category: 'Mental Health',
    durationSeconds: 384,
    coins: 4,
    thumbnailColor: '#8b5cf6',
    thumbnailIcon: 'heart-outline',
    instructor: 'Psych2Go',
    youtubeId: 'o18I23HCQtE',
  },
  {
    id: 'vid_mindfulness_practice',
    title: 'How to Practice Mindfulness',
    description: 'A clear, step-by-step introduction to mindfulness from a psychologist — no experience or equipment needed.',
    category: 'Mental Health',
    durationSeconds: 224,
    coins: 3,
    thumbnailColor: '#4f46e5',
    thumbnailIcon: 'leaf-outline',
    instructor: 'Psych Hub',
    youtubeId: 'bLpChrgS0AY',
  },
  // ── Fitness ───────────────────────────────────────────────────────────
  {
    id: 'vid_start_exercising',
    title: 'What Happens When You Start Exercising',
    description: 'An animated look at real-time changes in your muscles, heart, lungs, and brain the moment you begin working out.',
    category: 'Fitness',
    durationSeconds: 546,
    coins: 4,
    thumbnailColor: '#ea580c',
    thumbnailIcon: 'barbell-outline',
    instructor: 'Practical Wisdom',
    youtubeId: 'KEhbYNmY3N4',
  },
  {
    id: 'vid_exercise_benefits',
    title: 'Top 10 Benefits of Exercise',
    description: 'Doctor Mike Hansen walks through the ten strongest science-backed reasons why regular exercise is non-negotiable.',
    category: 'Fitness',
    durationSeconds: 492,
    coins: 4,
    thumbnailColor: '#dc2626',
    thumbnailIcon: 'body-outline',
    instructor: 'Doctor Mike Hansen',
    youtubeId: 'XqTcye_acTI',
  },
  {
    id: 'vid_cardio_vs_strength',
    title: 'Cardio vs. Strength Training',
    description: 'Which is better for your health and longevity? Oncology experts break down what the research actually shows.',
    category: 'Fitness',
    durationSeconds: 66,
    coins: 2,
    thumbnailColor: '#10b981',
    thumbnailIcon: 'walk-outline',
    instructor: 'UT MD Anderson',
    youtubeId: 'YvrKIQ_Tbsk',
  },
  // ── Prevention ────────────────────────────────────────────────────────
  {
    id: 'vid_prevention_levels',
    title: 'Levels of Disease Prevention',
    description: 'Primary, secondary, and tertiary prevention explained — how public health stops disease before it starts.',
    category: 'Prevention',
    durationSeconds: 419,
    coins: 4,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'Level Up RN',
    youtubeId: 'wAYlurDlGAI',
  },
  {
    id: 'vid_checkup_myths',
    title: 'Health Check-Up Myths Debunked',
    description: 'A surgeon separates fact from fiction on preventive screenings — who really needs them and how often.',
    category: 'Prevention',
    durationSeconds: 117,
    coins: 2,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'pulse-outline',
    instructor: 'Dr. Neeraj Goel',
    youtubeId: 'eV5gz_p53ZE',
  },
  {
    id: 'vid_annual_checkup',
    title: 'What to Expect at Your Annual Checkup',
    description: 'A walkthrough of what doctors actually do during a yearly physical and why each part of the exam matters.',
    category: 'Prevention',
    durationSeconds: 84,
    coins: 2,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'medical-outline',
    instructor: 'Remix Medical',
    youtubeId: 'q55RMYf6lAU',
  },
  // ── Medication ────────────────────────────────────────────────────────
  {
    id: 'vid_medication_safety',
    title: 'Medication Safety Essentials',
    description: 'How to take, store, and dispose of medications safely — including what to do when you miss a dose.',
    category: 'Medication',
    durationSeconds: 219,
    coins: 3,
    thumbnailColor: '#059669',
    thumbnailIcon: 'medkit-outline',
    instructor: 'Medical Centric',
    youtubeId: 'iQozgr7XnoY',
  },
  {
    id: 'vid_medication_admin',
    title: 'Safe Medication Administration',
    description: 'Pharmacology basics: the five rights of medication administration, common errors, and how to read a prescription.',
    category: 'Medication',
    durationSeconds: 674,
    coins: 4,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'flask-outline',
    instructor: 'Level Up RN',
    youtubeId: 'pWlOTAe97G4',
  },
  // ── Maternal Health ──────────────────────────────────────────────────────
  {
    id: 'vid_prenatal_care',
    title: 'Prenatal Care: All Three Trimesters',
    description: 'A thorough guide to what happens at your 1st, 2nd, and 3rd trimester check-ups and why each visit matters.',
    category: 'Maternal Health',
    durationSeconds: 501,
    coins: 4,
    thumbnailColor: '#db2777',
    thumbnailIcon: 'rose-outline',
    instructor: 'Level Up RN',
    youtubeId: 'wt9-6VWbfHI',
  },
  {
    id: 'vid_antenatal_what',
    title: 'What is Antenatal Care?',
    description: 'A clear explanation of antenatal visits — what to expect, what is checked, and why early care saves lives.',
    category: 'Maternal Health',
    durationSeconds: 252,
    coins: 3,
    thumbnailColor: '#ec4899',
    thumbnailIcon: 'heart-outline',
    instructor: 'Medical Centric',
    youtubeId: 'vIIcKmKNkk8',
  },
  {
    id: 'vid_postpartum_depression',
    title: 'Baby Blues vs. Postpartum Depression',
    description: 'An ER physician explains the difference between normal post-birth emotional shifts and postpartum depression.',
    category: 'Maternal Health',
    durationSeconds: 142,
    coins: 2,
    thumbnailColor: '#f472b6',
    thumbnailIcon: 'happy-outline',
    instructor: 'Jeff Yoo MD',
    youtubeId: 'roO0PbRlfKU',
  },
  // ── Public Health ─────────────────────────────────────────────────────────
  {
    id: 'vid_what_is_public_health',
    title: 'What is Public Health?',
    description: 'A concise overview of what public health professionals do, why it matters, and how it keeps communities safe.',
    category: 'Public Health',
    durationSeconds: 334,
    coins: 3,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'earth-outline',
    instructor: "Let's Learn Public Health",
    youtubeId: 't_eWESXTnic',
  },
  {
    id: 'vid_infectious_disease_control',
    title: 'Controlling Infectious Diseases',
    description: 'The basic principles of how public health controls the spread of infectious diseases in a population.',
    category: 'Public Health',
    durationSeconds: 320,
    coins: 3,
    thumbnailColor: '#0e7490',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: "Let's Learn Public Health",
    youtubeId: '2JWku3Kjpq0',
  },
  {
    id: 'vid_communicable_diseases',
    title: 'Communicable Diseases: What, Why & How',
    description: 'National Institute explains how communicable diseases spread, how to prevent transmission, and what surveillance does.',
    category: 'Public Health',
    durationSeconds: 325,
    coins: 3,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'bug-outline',
    instructor: 'NICD South Africa',
    youtubeId: 'LBkXQ_mBO3Q',
  },
  // ── Primary Care ──────────────────────────────────────────────────────────
  {
    id: 'vid_primary_care_importance',
    title: 'Why You Need a Primary Care Physician',
    description: 'How having a regular family doctor leads to better long-term health outcomes and earlier disease detection.',
    category: 'Primary Care',
    durationSeconds: 91,
    coins: 2,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'home-outline',
    instructor: 'Dignity Health',
    youtubeId: 'ZPHLtULjL18',
  },
  {
    id: 'vid_first_primary_visit',
    title: 'How to Prepare for Your First Primary Care Visit',
    description: 'What documents to bring, questions to ask, and what to expect at your first appointment with a new doctor.',
    category: 'Primary Care',
    durationSeconds: 198,
    coins: 3,
    thumbnailColor: '#15803d',
    thumbnailIcon: 'clipboard-outline',
    instructor: 'Dena Goldberg MS CGC',
    youtubeId: 'ilr2WF0EJqw',
  },
  {
    id: 'vid_primary_care_questions',
    title: 'Top 3 Questions to Ask Your Primary Care Doctor',
    description: 'A doctor walks through the three most impactful questions patients should raise at every routine visit.',
    category: 'Primary Care',
    durationSeconds: 587,
    coins: 4,
    thumbnailColor: '#059669',
    thumbnailIcon: 'chatbubble-outline',
    instructor: 'Mighty Health',
    youtubeId: 'BhKU6uqzXFA',
  },

  // ── Nutrition (6 more → 10 total) ────────────────────────────────────────
  {
    id: 'vid_digestive_system',
    title: 'How Your Digestive System Works',
    description: 'A step-by-step journey through the digestive tract showing exactly how nutrients are broken down and absorbed.',
    category: 'Nutrition',
    durationSeconds: 288,
    coins: 3,
    thumbnailColor: '#22c55e',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'TED-Ed',
    youtubeId: 'Og5xAdC8EUI',
  },
  {
    id: 'vid_obesity_science',
    title: 'The Science of Obesity',
    description: 'What actually causes obesity — hormones, environment and genetics — and why willpower alone rarely explains it.',
    category: 'Nutrition',
    durationSeconds: 308,
    coins: 3,
    thumbnailColor: '#f97316',
    thumbnailIcon: 'body-outline',
    instructor: 'TED-Ed',
    youtubeId: 'BRFh9bKFkh0',
  },
  {
    id: 'vid_gut_brain_axis',
    title: 'The Gut–Brain Connection',
    description: 'Your gut and brain communicate constantly. Learn how diet shapes mood, memory and mental performance.',
    category: 'Nutrition',
    durationSeconds: 324,
    coins: 3,
    thumbnailColor: '#84cc16',
    thumbnailIcon: 'flask-outline',
    instructor: 'TED-Ed',
    youtubeId: 'Aobg9cCIqbo',
  },
  {
    id: 'vid_fiber_importance',
    title: 'Why Dietary Fiber Is Essential',
    description: 'Fiber does far more than aid digestion — it sculpts your gut microbiome and cuts chronic disease risk significantly.',
    category: 'Nutrition',
    durationSeconds: 266,
    coins: 3,
    thumbnailColor: '#65a30d',
    thumbnailIcon: 'leaf-outline',
    instructor: 'TED-Ed',
    youtubeId: '_BySlqeh9WI',
  },
  {
    id: 'vid_protein_sources',
    title: 'Animal vs Plant Protein: What Science Says',
    description: 'Compare animal and plant proteins and discover how to meet your daily protein needs on any eating style.',
    category: 'Nutrition',
    durationSeconds: 360,
    coins: 3,
    thumbnailColor: '#a16207',
    thumbnailIcon: 'leaf-outline',
    instructor: 'Hospital for Special Surgery',
    youtubeId: 'bZnRWC_XKMw',
  },
  {
    id: 'vid_micronutrients',
    title: 'Micronutrients: Vitamins & Minerals Explained',
    description: 'What every major vitamin and mineral does in your body and the real cost of chronic deficiencies.',
    category: 'Nutrition',
    durationSeconds: 420,
    coins: 3,
    thumbnailColor: '#eab308',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'Amoeba Sisters',
    youtubeId: 'Fv0MeXstdLA',
  },

  // ── Mental Health (7 more → 10 total) ────────────────────────────────────
  {
    id: 'vid_depression_explained',
    title: 'What Is Depression?',
    description: 'An animated explainer on the neuroscience of depression, why it happens, and how modern treatments work.',
    category: 'Mental Health',
    durationSeconds: 295,
    coins: 3,
    thumbnailColor: '#a855f7',
    thumbnailIcon: 'happy-outline',
    instructor: 'TED-Ed',
    youtubeId: 'z-IR48Mb3W0',
  },
  {
    id: 'vid_anxiety_brain',
    title: 'What Happens in Your Brain During Anxiety',
    description: 'Discover the neuroscience of anxiety — what triggers it, how it feels physically, and evidence-based coping tools.',
    category: 'Mental Health',
    durationSeconds: 318,
    coins: 3,
    thumbnailColor: '#8b5cf6',
    thumbnailIcon: 'pulse-outline',
    instructor: 'TED-Ed',
    youtubeId: 'TFbv739Xm7I',
  },
  {
    id: 'vid_grief_loss',
    title: 'Understanding Grief and Loss',
    description: 'What grief really looks like biologically and emotionally, and how to support yourself through painful losses.',
    category: 'Mental Health',
    durationSeconds: 274,
    coins: 3,
    thumbnailColor: '#7c3aed',
    thumbnailIcon: 'heart-outline',
    instructor: 'TED-Ed',
    youtubeId: 'Mjbv6bC1oeo',
  },
  {
    id: 'vid_emotional_regulation',
    title: 'How to Regulate Your Emotions',
    description: 'Therapist-approved techniques to pause, process, and redirect overwhelming emotions in real time.',
    category: 'Mental Health',
    durationSeconds: 344,
    coins: 4,
    thumbnailColor: '#9333ea',
    thumbnailIcon: 'leaf-outline',
    instructor: 'Therapy in a Nutshell',
    youtubeId: 'pzSTobFtpE8',
  },
  {
    id: 'vid_self_compassion',
    title: 'The Power of Self-Compassion',
    description: 'Research by Dr. Kristin Neff shows why self-compassion consistently outperforms self-esteem for mental wellbeing.',
    category: 'Mental Health',
    durationSeconds: 333,
    coins: 3,
    thumbnailColor: '#c026d3',
    thumbnailIcon: 'rose-outline',
    instructor: 'Kristin Neff · TEDx',
    youtubeId: 'IvtZBUSplr4',
  },
  {
    id: 'vid_therapy_works',
    title: 'How Does Therapy Actually Work?',
    description: 'A clear explainer on the science behind CBT, DBT, and talk therapy — and how to know if you might benefit.',
    category: 'Mental Health',
    durationSeconds: 390,
    coins: 4,
    thumbnailColor: '#7c3aed',
    thumbnailIcon: 'chatbubble-outline',
    instructor: 'Psych Hub',
    youtubeId: 'LPKShJoXFBg',
  },
  {
    id: 'vid_burnout_recovery',
    title: 'Burnout: Signs, Causes & Recovery',
    description: 'Burnout is not just tiredness — learn to recognise warning signs and the steps that genuinely aid recovery.',
    category: 'Mental Health',
    durationSeconds: 426,
    coins: 4,
    thumbnailColor: '#6d28d9',
    thumbnailIcon: 'battery-dead-outline',
    instructor: 'Big Think',
    youtubeId: 'FbcXFPFiXkA',
  },

  // ── Fitness (7 more → 10 total) ───────────────────────────────────────────
  {
    id: 'vid_sedentary_danger',
    title: 'The Dangers of Sitting Too Much',
    description: 'What a sedentary lifestyle does to your cardiovascular system, metabolism, and spine over years of desk work.',
    category: 'Fitness',
    durationSeconds: 278,
    coins: 3,
    thumbnailColor: '#ef4444',
    thumbnailIcon: 'walk-outline',
    instructor: 'TED-Ed',
    youtubeId: 'wUEl8KrMz14',
  },
  {
    id: 'vid_how_muscles_grow',
    title: 'How Do Muscles Grow?',
    description: 'The cellular science of muscle hypertrophy — how resistance training causes individual fibres to rebuild bigger.',
    category: 'Fitness',
    durationSeconds: 300,
    coins: 3,
    thumbnailColor: '#f97316',
    thumbnailIcon: 'barbell-outline',
    instructor: 'TED-Ed',
    youtubeId: '2tM1LFFxeKg',
  },
  {
    id: 'vid_vo2max',
    title: 'VO₂ Max: The Best Predictor of Long-Term Health',
    description: 'Your VO₂ max predicts longevity better than almost any other biomarker. Learn what it is and how to improve it.',
    category: 'Fitness',
    durationSeconds: 330,
    coins: 3,
    thumbnailColor: '#dc2626',
    thumbnailIcon: 'heart-outline',
    instructor: 'Institute of Human Anatomy',
    youtubeId: 'Pj_cC-J-1XM',
  },
  {
    id: 'vid_hiit_science',
    title: 'The Science Behind High-Intensity Interval Training',
    description: 'HIIT packs maximum cardiovascular benefit into minimum time. Here is the physiology that makes it work.',
    category: 'Fitness',
    durationSeconds: 315,
    coins: 3,
    thumbnailColor: '#b91c1c',
    thumbnailIcon: 'barbell-outline',
    instructor: 'Vox',
    youtubeId: 'GFcCyOVd1S4',
  },
  {
    id: 'vid_flexibility_matters',
    title: 'Why Stretching Matters More Than You Think',
    description: 'Flexibility determines injury risk, posture, and mobility into old age — not just gymnastics performance.',
    category: 'Fitness',
    durationSeconds: 288,
    coins: 3,
    thumbnailColor: '#f59e0b',
    thumbnailIcon: 'body-outline',
    instructor: 'TED-Ed',
    youtubeId: '1LsSAMeX5Sc',
  },
  {
    id: 'vid_active_recovery',
    title: 'Rest Days vs Active Recovery: What Science Says',
    description: 'Light movement on off days accelerates muscle repair better than total rest — here is why.',
    category: 'Fitness',
    durationSeconds: 258,
    coins: 3,
    thumbnailColor: '#059669',
    thumbnailIcon: 'walk-outline',
    instructor: 'SciShow',
    youtubeId: '95oJFq1TqEI',
  },
  {
    id: 'vid_posture_health',
    title: 'How Bad Posture Damages Your Health',
    description: 'Poor posture does far more than cause back pain — it also affects breathing, digestion, and long-term energy.',
    category: 'Fitness',
    durationSeconds: 292,
    coins: 3,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'body-outline',
    instructor: 'TED-Ed',
    youtubeId: 'OyK0oE5jwMY',
  },

  // ── Prevention (7 more → 10 total) ───────────────────────────────────────
  {
    id: 'vid_blood_pressure_basics',
    title: 'Understanding Blood Pressure Numbers',
    description: 'What systolic and diastolic mean, why hypertension is called "the silent killer", and proven ways to control it.',
    category: 'Prevention',
    durationSeconds: 240,
    coins: 3,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'heart-outline',
    instructor: 'TED-Ed',
    youtubeId: 'Ab9OZsDECZw',
  },
  {
    id: 'vid_cancer_prevention',
    title: 'Lifestyle Choices That Reduce Cancer Risk',
    description: 'How diet, exercise, sun protection, and not smoking together reduce your lifetime cancer risk by up to 40%.',
    category: 'Prevention',
    durationSeconds: 349,
    coins: 3,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'TED-Ed',
    youtubeId: 'WsZXFHuoByE',
  },
  {
    id: 'vid_heart_disease_prev',
    title: 'Preventing Heart Disease: What Actually Works',
    description: 'Doctor Mike breaks down the most evidence-backed interventions for keeping your cardiovascular system healthy.',
    category: 'Prevention',
    durationSeconds: 420,
    coins: 4,
    thumbnailColor: '#ef4444',
    thumbnailIcon: 'heart-outline',
    instructor: 'Doctor Mike',
    youtubeId: 'a3B3yJRoHOo',
  },
  {
    id: 'vid_diabetes_prevention',
    title: 'How to Prevent Type 2 Diabetes',
    description: 'Sustainable diet and activity changes that dramatically lower your risk of developing type 2 diabetes.',
    category: 'Prevention',
    durationSeconds: 308,
    coins: 3,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'pulse-outline',
    instructor: 'TED-Ed',
    youtubeId: 'UKE6WhJWDSo',
  },
  {
    id: 'vid_handwashing_science',
    title: 'The Science of Handwashing',
    description: 'Why handwashing remains the single most effective defence against infection — and exactly how to do it correctly.',
    category: 'Prevention',
    durationSeconds: 178,
    coins: 2,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'water-outline',
    instructor: 'TED-Ed',
    youtubeId: '3GtBhRWz5Vs',
  },
  {
    id: 'vid_skin_cancer_basics',
    title: 'Skin Cancer: How to Spot It Early',
    description: 'UV exposure, the ABCDE rule for suspicious moles, and evidence-based screening steps everyone should know.',
    category: 'Prevention',
    durationSeconds: 220,
    coins: 3,
    thumbnailColor: '#f97316',
    thumbnailIcon: 'sunny-outline',
    instructor: 'American Cancer Society',
    youtubeId: 'EEolHi2IVGE',
  },
  {
    id: 'vid_sleep_prevention',
    title: 'How Good Sleep Prevents Chronic Disease',
    description: 'Poor sleep drives obesity, diabetes, heart disease, and immune failure. Good sleep genuinely prevents them.',
    category: 'Prevention',
    durationSeconds: 385,
    coins: 4,
    thumbnailColor: '#4f46e5',
    thumbnailIcon: 'moon-outline',
    instructor: 'Matt Walker · TED',
    youtubeId: 'aXItOY0saMY',
  },

  // ── Medication (8 more → 10 total) ───────────────────────────────────────
  {
    id: 'vid_antibiotics_how',
    title: 'How Antibiotics Work — and Why Resistance Develops',
    description: 'The mechanisms by which antibiotics kill bacteria, and why overuse inevitably produces resistant superbugs.',
    category: 'Medication',
    durationSeconds: 255,
    coins: 3,
    thumbnailColor: '#059669',
    thumbnailIcon: 'flask-outline',
    instructor: 'TED-Ed',
    youtubeId: 'znnp-Ivj2ek',
  },
  {
    id: 'vid_painkillers_science',
    title: 'How Painkillers Block Pain Signals',
    description: 'From paracetamol to opioids — the science of how different analgesics interrupt pain transmission in your nerves.',
    category: 'Medication',
    durationSeconds: 296,
    coins: 3,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'medkit-outline',
    instructor: 'TED-Ed',
    youtubeId: '9mcuIc5O-DE',
  },
  {
    id: 'vid_generic_vs_brand',
    title: 'Generic vs Brand-Name Drugs: Are They the Same?',
    description: 'The FDA bioequivalence standard explained — and why you can usually trust generics to work just as well.',
    category: 'Medication',
    durationSeconds: 224,
    coins: 3,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'medkit-outline',
    instructor: 'TED-Ed',
    youtubeId: 'G9o3LFopFig',
  },
  {
    id: 'vid_drug_interactions',
    title: 'Understanding Drug Interactions',
    description: 'How combining medications — or mixing with food, alcohol, or supplements — can change how each drug works.',
    category: 'Medication',
    durationSeconds: 310,
    coins: 4,
    thumbnailColor: '#ef4444',
    thumbnailIcon: 'warning-outline',
    instructor: 'Pharmacist Tips',
    youtubeId: 'szqrHljBLQA',
  },
  {
    id: 'vid_vaccine_types',
    title: 'The Different Types of Vaccines Explained',
    description: 'mRNA, live-attenuated, inactivated: understand how each vaccine platform trains your immune system differently.',
    category: 'Medication',
    durationSeconds: 341,
    coins: 4,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'Kurzgesagt',
    youtubeId: 'rb7TVW77ZCs',
  },
  {
    id: 'vid_adherence_matters',
    title: 'Why Medication Adherence Changes Everything',
    description: 'Missing doses is the #1 reason treatments fail. Practical strategies to stay on track with any prescription.',
    category: 'Medication',
    durationSeconds: 214,
    coins: 3,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'checkmark-circle-outline',
    instructor: 'Medical Centric',
    youtubeId: 'ifxMTFCMnRY',
  },
  {
    id: 'vid_otc_safety',
    title: 'Staying Safe with Over-the-Counter Medicines',
    description: 'Which OTC drugs are safe to combine, which combinations to avoid, and when symptoms need a doctor.',
    category: 'Medication',
    durationSeconds: 302,
    coins: 3,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'medkit-outline',
    instructor: 'TED-Ed',
    youtubeId: 'Zjbm9YXMHOk',
  },
  {
    id: 'vid_antimicrobial_res',
    title: 'The Antibiotic Resistance Crisis',
    description: 'Drug-resistant bacteria kill over a million people yearly. What patients and prescribers can do to slow the spread.',
    category: 'Medication',
    durationSeconds: 288,
    coins: 3,
    thumbnailColor: '#dc2626',
    thumbnailIcon: 'bug-outline',
    instructor: 'World Health Organization',
    youtubeId: 'Rb4_AFQE2V0',
  },

  // ── Maternal Health (7 more → 10 total) ──────────────────────────────────
  {
    id: 'vid_fetal_development',
    title: 'Stages of Fetal Development',
    description: 'Follow the journey from fertilisation to birth and see how every organ forms and matures week by week.',
    category: 'Maternal Health',
    durationSeconds: 318,
    coins: 3,
    thumbnailColor: '#ec4899',
    thumbnailIcon: 'rose-outline',
    instructor: 'TED-Ed',
    youtubeId: 'pIv7-Ir0Wog',
  },
  {
    id: 'vid_breastfeeding_science',
    title: 'The Science of Breastfeeding',
    description: 'What is in breast milk, how it adapts to newborn needs, and the health benefits for both mother and infant.',
    category: 'Maternal Health',
    durationSeconds: 402,
    coins: 4,
    thumbnailColor: '#f472b6',
    thumbnailIcon: 'heart-outline',
    instructor: 'TED-Ed',
    youtubeId: 'Ywui7C0LRLU',
  },
  {
    id: 'vid_gestational_diabetes',
    title: 'Gestational Diabetes: What You Need to Know',
    description: 'How gestational diabetes develops, how it is diagnosed, and lifestyle choices that protect mother and baby.',
    category: 'Maternal Health',
    durationSeconds: 325,
    coins: 3,
    thumbnailColor: '#db2777',
    thumbnailIcon: 'pulse-outline',
    instructor: 'Medical Centric',
    youtubeId: 'M14Rm_3w0Ac',
  },
  {
    id: 'vid_preeclampsia',
    title: 'Preeclampsia: Signs, Risks & Management',
    description: 'High blood pressure in pregnancy is dangerous — recognise the warning signs and understand the treatments.',
    category: 'Maternal Health',
    durationSeconds: 344,
    coins: 4,
    thumbnailColor: '#e11d48',
    thumbnailIcon: 'warning-outline',
    instructor: 'Doctor Mike',
    youtubeId: 'pBHNqXrPiAc',
  },
  {
    id: 'vid_exercise_pregnancy',
    title: 'Safe Exercise During Pregnancy',
    description: 'OB-GYN guidelines on which exercises are beneficial, which to avoid, and why staying active helps mother and baby.',
    category: 'Maternal Health',
    durationSeconds: 278,
    coins: 3,
    thumbnailColor: '#f9a8d4',
    thumbnailIcon: 'barbell-outline',
    instructor: 'What to Expect',
    youtubeId: 'v9IIMGN3vok',
  },
  {
    id: 'vid_newborn_first_days',
    title: 'Newborn Care: The First 48 Hours',
    description: 'What to expect when you bring your baby home — feeding, safe sleep, umbilical cord care, and red-flag symptoms.',
    category: 'Maternal Health',
    durationSeconds: 396,
    coins: 4,
    thumbnailColor: '#db2777',
    thumbnailIcon: 'rose-outline',
    instructor: "Cincinnati Children's",
    youtubeId: '3h_5UMlnVKw',
  },
  {
    id: 'vid_maternal_nutrition',
    title: 'Nutrition During Pregnancy',
    description: 'Critical nutrients for a healthy pregnancy, foods to avoid, and how to build a balanced prenatal diet safely.',
    category: 'Maternal Health',
    durationSeconds: 312,
    coins: 3,
    thumbnailColor: '#ec4899',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'PregnancyChat',
    youtubeId: 'QiNEIoHoFuE',
  },

  // ── Public Health (7 more → 10 total) ────────────────────────────────────
  {
    id: 'vid_epidemics_spread',
    title: 'How Epidemics Spread — and How We Stop Them',
    description: 'Track how a single infection becomes a global outbreak, and the epidemiological models used to contain it.',
    category: 'Public Health',
    durationSeconds: 267,
    coins: 3,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'earth-outline',
    instructor: 'TED-Ed',
    youtubeId: 'vSFd7FxaPNk',
  },
  {
    id: 'vid_herd_immunity',
    title: 'Herd Immunity Explained',
    description: 'What herd immunity is, how it protects vulnerable people, and why vaccination rates must hit a critical threshold.',
    category: 'Public Health',
    durationSeconds: 258,
    coins: 3,
    thumbnailColor: '#0e7490',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'Vox',
    youtubeId: 'jzSRENsZTBk',
  },
  {
    id: 'vid_social_determinants',
    title: 'Social Determinants of Health',
    description: 'Why your postcode predicts your health as much as your doctor — poverty, housing, and education all matter.',
    category: 'Public Health',
    durationSeconds: 412,
    coins: 4,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'people-outline',
    instructor: 'RWJF',
    youtubeId: '1O8j33v-XLc',
  },
  {
    id: 'vid_clean_water_health',
    title: 'Clean Water and Global Health',
    description: 'The profound impact of safe drinking water on child survival, disease burden, and community wellbeing.',
    category: 'Public Health',
    durationSeconds: 243,
    coins: 3,
    thumbnailColor: '#06b6d4',
    thumbnailIcon: 'water-outline',
    instructor: 'TED-Ed',
    youtubeId: 'oiIe6hWAb3o',
  },
  {
    id: 'vid_ncds_global',
    title: 'The Global Burden of Non-Communicable Disease',
    description: 'How heart disease, cancer, and diabetes became the world\'s biggest killers, and what policy changes reduce them.',
    category: 'Public Health',
    durationSeconds: 388,
    coins: 4,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'earth-outline',
    instructor: 'WHO',
    youtubeId: 'TzJ0M5ZKBVY',
  },
  {
    id: 'vid_mental_health_stigma',
    title: 'Breaking Down Mental Health Stigma',
    description: 'Where mental health stigma comes from, how it prevents people from seeking help, and what communities can do.',
    category: 'Public Health',
    durationSeconds: 314,
    coins: 3,
    thumbnailColor: '#7c3aed',
    thumbnailIcon: 'people-outline',
    instructor: 'Time to Change',
    youtubeId: 'j3xPYPCfJMI',
  },
  {
    id: 'vid_climate_health',
    title: 'Climate Change and Human Health',
    description: 'How rising temperatures, extreme weather, and air pollution are driving disease and what public health must do.',
    category: 'Public Health',
    durationSeconds: 436,
    coins: 4,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'earth-outline',
    instructor: 'Lancet Countdown',
    youtubeId: 'm1tT-F_FLmU',
  },

  // ── Primary Care (7 more → 10 total) ─────────────────────────────────────
  {
    id: 'vid_when_see_doctor',
    title: 'When Should You Actually See a Doctor?',
    description: 'A guide to which symptoms need urgent attention, which can wait, and how not to over- or under-use your GP.',
    category: 'Primary Care',
    durationSeconds: 312,
    coins: 3,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'medical-outline',
    instructor: 'Doctor Mike',
    youtubeId: 'tqh6CXFHTAM',
  },
  {
    id: 'vid_talk_to_doctor',
    title: 'How to Talk to Your Doctor Effectively',
    description: 'Symptom diaries, prepared questions, and assertive communication techniques that improve every consultation.',
    category: 'Primary Care',
    durationSeconds: 284,
    coins: 3,
    thumbnailColor: '#15803d',
    thumbnailIcon: 'chatbubble-outline',
    instructor: 'Cleveland Clinic',
    youtubeId: 'rkuXvWwYRro',
  },
  {
    id: 'vid_blood_tests_explained',
    title: 'Understanding Your Blood Test Results',
    description: 'What CBC, metabolic panels, lipid profiles, and HbA1c actually measure — and the ranges that should concern you.',
    category: 'Primary Care',
    durationSeconds: 480,
    coins: 4,
    thumbnailColor: '#059669',
    thumbnailIcon: 'flask-outline',
    instructor: 'Doctor Mike',
    youtubeId: '3OxNz_3Wy0I',
  },
  {
    id: 'vid_chronic_condition_mgmt',
    title: 'Managing a Chronic Condition Day-to-Day',
    description: 'Evidence-based self-management strategies for living well with diabetes, hypertension, asthma, or arthritis.',
    category: 'Primary Care',
    durationSeconds: 368,
    coins: 4,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'pulse-outline',
    instructor: 'Mighty Health',
    youtubeId: 'lEhBJiKX_gY',
  },
  {
    id: 'vid_telehealth_guide',
    title: 'Getting the Most from Telehealth Appointments',
    description: 'How virtual consultations work, what to prepare, and how to communicate symptoms clearly over video.',
    category: 'Primary Care',
    durationSeconds: 252,
    coins: 3,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'videocam-outline',
    instructor: 'American Family Physician',
    youtubeId: 'OyRLqGrfKjo',
  },
  {
    id: 'vid_preventive_screening',
    title: 'Which Health Screenings Do You Actually Need?',
    description: 'Age-based screening recommendations for cancer, diabetes, cholesterol, and blood pressure — backed by evidence.',
    category: 'Primary Care',
    durationSeconds: 344,
    coins: 4,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'Dr. Neeraj Goel',
    youtubeId: 'BjSPz9b0pXo',
  },
  {
    id: 'vid_doctor_patient_rel',
    title: 'Building a Good Doctor–Patient Relationship',
    description: 'Trust, honesty, and communication skills that make every clinical encounter safer and more effective.',
    category: 'Primary Care',
    durationSeconds: 296,
    coins: 3,
    thumbnailColor: '#15803d',
    thumbnailIcon: 'heart-outline',
    instructor: 'Stanford Medicine',
    youtubeId: 's0bYJyABHOI',
  },
];
// ── Helpers ───────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Persisted shape ───────────────────────────────────────────────────────

interface PersistedExploreData {
  lifecoins: number;
  totalEarned: number;
  progress: VideoProgress[];   // sparse — only videos that have been rewarded
  lastWatchDate: string | null;
  dailyWatchedCount: number;
}

// ── Store ─────────────────────────────────────────────────────────────────

interface ExploreState extends PersistedExploreData {
  initialized: boolean;
  /** Live catalogue fetched from the server (falls back to SEED_VIDEOS). */
  videos: ExploreVideo[];
  /** Number of rewards allowed per day (comes from server). */
  dailyCap: number;
  /** YYYY-MM-DD of the last successful remote video fetch (in-memory only). */
  lastVideoRefreshDate: string | null;
  initialize: () => Promise<void>;
  /** Refreshes just the video catalogue + today's rewards from the API. */
  refreshVideos: () => Promise<void>;
  claimReward: (videoId: string) => Promise<{ alreadyDone: boolean; coinsEarned: number; capReached: boolean }>;
  isRewarded: (videoId: string) => boolean;
  getDailyRemaining: () => number;
}

async function persist(data: PersistedExploreData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Fetch videos + today's rewarded IDs from the API. Returns null on failure. */
async function fetchRemote(): Promise<{ videos: ExploreVideo[]; rewardedIds: string[]; dailyCap: number } | null> {
  try {
    const res = await api.get<{
      success: boolean;
      data: {
        videos: ExploreVideo[];
        rewardedIds: string[];
        dailyCap: number;
      };
    }>('/explore/videos');
    if (res.data.success) {
      const d = res.data.data;
      return {
        videos: d.videos ?? SEED_VIDEOS,
        rewardedIds: d.rewardedIds ?? [],
        dailyCap: d.dailyCap ?? DAILY_VIDEO_CAP,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const useExploreStore = create<ExploreState>((set, get) => ({
  lifecoins: 0,
  totalEarned: 0,
  progress: [],
  lastWatchDate: null,
  dailyWatchedCount: 0,
  initialized: false,
  videos: SEED_VIDEOS,
  dailyCap: DAILY_VIDEO_CAP,
  lastVideoRefreshDate: null,

  initialize: async () => {
    // 1. Restore persisted coins/progress from AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: PersistedExploreData = JSON.parse(raw);
        const today = todayStr();
        const dailyWatchedCount = data.lastWatchDate === today ? (data.dailyWatchedCount ?? 0) : 0;
        set({ ...data, dailyWatchedCount });
      }
    } catch { /* ignore */ }

    // 2. Fetch live catalogue + today's server-side rewards
    const remote = await fetchRemote();
    if (remote) {
      const today = todayStr();
      // Merge server-known rewarded IDs into local progress so isRewarded() is accurate
      const existingProgress = get().progress.filter((p) => p.rewardedDate !== today);
      const serverProgress: VideoProgress[] = remote.rewardedIds.map((id) => ({
        videoId: id,
        rewardedDate: today,
      }));
      const mergedProgress = [...existingProgress, ...serverProgress];
      set({
        videos: remote.videos,
        dailyCap: remote.dailyCap,
        progress: mergedProgress,
        dailyWatchedCount: remote.rewardedIds.length,
        lastVideoRefreshDate: today,
        initialized: true,
      });
    } else {
      // Offline — use seed catalogue and local progress
      set({ initialized: true });
    }
  },

  refreshVideos: async () => {
    const remote = await fetchRemote();
    if (!remote) return;
    const today = todayStr();
    const existingProgress = get().progress.filter((p) => p.rewardedDate !== today);
    const serverProgress: VideoProgress[] = remote.rewardedIds.map((id) => ({
      videoId: id,
      rewardedDate: today,
    }));
    set({
      videos: remote.videos,
      dailyCap: remote.dailyCap,
      progress: [...existingProgress, ...serverProgress],
      dailyWatchedCount: remote.rewardedIds.length,
      lastVideoRefreshDate: today,
    });
  },

  claimReward: async (videoId) => {
    const state = get();
    const today = todayStr();

    // Optimistic duplicate-check
    const entry = state.progress.find((p) => p.videoId === videoId);
    if (entry?.rewardedDate === today) {
      return { alreadyDone: true, coinsEarned: 0, capReached: false };
    }

    // Try server claim first
    try {
      const res = await api.post<{
        success: boolean;
        data: { coinsEarned: number; alreadyClaimed: boolean; capReached: boolean };
      }>('/explore/claim', { videoId });

      if (res.data.success) {
        const { coinsEarned, alreadyClaimed, capReached } = res.data.data;

        if (!alreadyClaimed && !capReached && coinsEarned > 0) {
          const updatedProgress = state.progress.filter((p) => p.videoId !== videoId);
          updatedProgress.push({ videoId, rewardedDate: today });
          const newCoins = state.lifecoins + coinsEarned;
          const newEarned = state.totalEarned + coinsEarned;
          const dailyCount = state.lastWatchDate === today ? state.dailyWatchedCount : 0;
          set({
            lifecoins: newCoins,
            totalEarned: newEarned,
            progress: updatedProgress,
            lastWatchDate: today,
            dailyWatchedCount: dailyCount + 1,
          });
          await persist({
            lifecoins: newCoins,
            totalEarned: newEarned,
            progress: updatedProgress,
            lastWatchDate: today,
            dailyWatchedCount: dailyCount + 1,
          });
        }

        return { alreadyDone: alreadyClaimed, coinsEarned, capReached };
      }
    } catch { /* fall through to offline path */ }

    // Offline fallback — use local state
    const dailyCount = state.lastWatchDate === today ? state.dailyWatchedCount : 0;
    if (dailyCount >= state.dailyCap) {
      return { alreadyDone: false, coinsEarned: 0, capReached: true };
    }

    const video = state.videos.find((v) => v.id === videoId) ?? SEED_VIDEOS.find((v) => v.id === videoId);
    if (!video) return { alreadyDone: false, coinsEarned: 0, capReached: false };

    const updatedProgress = state.progress.filter((p) => p.videoId !== videoId);
    updatedProgress.push({ videoId, rewardedDate: today });
    const newCoins = state.lifecoins + video.coins;
    const newEarned = state.totalEarned + video.coins;
    set({
      lifecoins: newCoins,
      totalEarned: newEarned,
      progress: updatedProgress,
      lastWatchDate: today,
      dailyWatchedCount: dailyCount + 1,
    });
    await persist({
      lifecoins: newCoins,
      totalEarned: newEarned,
      progress: updatedProgress,
      lastWatchDate: today,
      dailyWatchedCount: dailyCount + 1,
    });
    return { alreadyDone: false, coinsEarned: video.coins, capReached: false };
  },

  isRewarded: (videoId) => {
    const { progress } = get();
    const today = todayStr();
    return progress.some((p) => p.videoId === videoId && p.rewardedDate === today);
  },

  getDailyRemaining: () => {
    const { lastWatchDate, dailyWatchedCount, dailyCap } = get();
    const today = todayStr();
    const watched = lastWatchDate === today ? dailyWatchedCount : 0;
    return Math.max(0, dailyCap - watched);
  },
}));

// ── Daily shuffle ─────────────────────────────────────────────────────────────

/**
 * Returns the video catalogue in a deterministic shuffled order that changes
 * once per calendar day, ensuring variety without ever repeating the same
 * ordering two days in a row. Pass the live videos array from the store.
 */
export function getDailyShuffledVideos(videos: ExploreVideo[] = SEED_VIDEOS): ExploreVideo[] {
  // Build a numeric seed from today's YYYY-MM-DD string
  const today = new Date().toISOString().slice(0, 10);
  const seed = today.split('').reduce<number>((acc, c) => acc + c.charCodeAt(0), 0);
  const arr = [...videos];
  // Fisher-Yates shuffle using the date-derived seed
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed * (i + 1))) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
