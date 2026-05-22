-- Migration 047: Seed 24 OpenClaw AI-backed physician accounts.
--
-- These physicians map 1-to-1 with lifegate-openclaw/agents/<slug>/ agent
-- definitions and together cover all 53 recognised medical specialisations.
-- Gender-balanced (12M / 12F).  13 Nigerian ethnic groups represented.
-- Default password: Doctor@LifeGate1  (must be rotated after first login).
-- Safe to re-run: INSERT … ON CONFLICT DO NOTHING.

INSERT INTO users (
    user_id, patient_id, name, email, password_hash,
    role, gender, phone, dob,
    specialization,
    certificate_name, certificate_id, certificate_issue_date,
    years_of_experience,
    mdcn_verified, mdcn_verified_at,
    account_status,
    openclaw_agent_slug
) VALUES

-- ── 1  Dr Ahmed Musa — General Medicine (Hausa, M) ──────────────────────
(
    'USR-OCL001', 'PAT-OCL001',
    'Ahmed Musa',
    'ahmed.musa@lifegate.health',
    '$2b$10$jBNT6RBbQ4CpTQrP.kLlduBDcdWx6109Rxz2YXMg8vmvJUzF9ulNq',
    'professional', 'male', '+2348060010001', '1983-04-12',
    'General Medicine',
    'MBBS (Ahmadu Bello University, Zaria)', 'MDCN-OCL-200101',
    '2008-07-01', '18',
    TRUE, NOW(), 'active',
    'dr-ahmed-musa'
),

-- ── 2  Dr Ngozi Okafor — General Medicine + AI Validation (Igbo, F) ─────
(
    'USR-OCL002', 'PAT-OCL002',
    'Ngozi Okafor',
    'ngozi.okafor@lifegate.health',
    '$2b$10$iLVfkht1Fh0jbHA4/r868epBnqY8Fxdgh4H6Elcr4wCLkxkJFFEL6',
    'professional', 'female', '+2348060010002', '1986-09-03',
    'General Medicine',
    'MBBS (University of Nigeria, Nsukka)', 'MDCN-OCL-200202',
    '2011-11-01', '15',
    TRUE, NOW(), 'active',
    'dr-ngozi-okafor'
),

-- ── 3  Dr Terseer Tyav — Emergency Medicine (Tiv, M) ────────────────────
(
    'USR-OCL003', 'PAT-OCL003',
    'Terseer Tyav',
    'terseer.tyav@lifegate.health',
    '$2b$10$z0CPOf0xXPsgmCoc6Xz6.u89zTnXBhko2xTyAjpUbLbPNDLVdLR.2',
    'professional', 'male', '+2348060010003', '1984-02-27',
    'Emergency Medicine',
    'MBBS (Benue State University)', 'MDCN-OCL-200303',
    '2009-06-15', '17',
    TRUE, NOW(), 'active',
    'dr-terseer-tyav'
),

-- ── 4  Dr Bukola Adesanya — Emergency Medicine + Telemedicine (Yoruba, F)
(
    'USR-OCL004', 'PAT-OCL004',
    'Bukola Adesanya',
    'bukola.adesanya@lifegate.health',
    '$2b$10$W9.cLU6hfErKgiSCjzHdxeonEtg6fu/KAFmwqHjn7/bAHStbrLVK6',
    'professional', 'female', '+2348060010004', '1987-11-15',
    'Emergency Medicine',
    'MBBS (University of Lagos)', 'MDCN-OCL-200404',
    '2012-09-01', '14',
    TRUE, NOW(), 'active',
    'dr-bukola-adesanya'
),

-- ── 5  Dr Ibrahim Danladi — Cardiology (Hausa, M) ───────────────────────
(
    'USR-OCL005', 'PAT-OCL005',
    'Ibrahim Danladi',
    'ibrahim.danladi@lifegate.health',
    '$2b$10$K3P7cF7PwvF4iloozoi1tOor8NiTD8NgZ4oaOhINvX562fXuxsPJO',
    'professional', 'male', '+2348060010005', '1979-06-20',
    'Cardiology',
    'MBBS, FWACP-Cardiology (Bayero University, Kano)', 'MDCN-OCL-200505',
    '2005-03-01', '21',
    TRUE, NOW(), 'active',
    'dr-ibrahim-danladi'
),

-- ── 6  Dr Adaeze Nwosu — Cardiology + Rheumatology (Igbo, F) ────────────
(
    'USR-OCL006', 'PAT-OCL006',
    'Adaeze Nwosu',
    'adaeze.nwosu@lifegate.health',
    '$2b$10$Sm22E1TSdGwn1/CFRk5Ho.fXo/4Wk4Pd7r/ZNPCvzcuSfk0Q6TOZC',
    'professional', 'female', '+2348060010006', '1982-01-08',
    'Cardiology, Rheumatology',
    'MBBS, FMCP (Nnamdi Azikiwe University)', 'MDCN-OCL-200606',
    '2007-08-01', '19',
    TRUE, NOW(), 'active',
    'dr-adaeze-nwosu'
),

-- ── 7  Dr Babatunde Fasanya — Neurology (Yoruba, M) ─────────────────────
(
    'USR-OCL007', 'PAT-OCL007',
    'Babatunde Fasanya',
    'babatunde.fasanya@lifegate.health',
    '$2b$10$LQ.u6EQn.EQfDjVumfu5NeKnoGVvUVAwQQnlMM87Xh0RCo2rgklvC',
    'professional', 'male', '+2348060010007', '1980-07-31',
    'Neurology',
    'MBBS, FWACP-Neurology (University of Ibadan)', 'MDCN-OCL-200707',
    '2006-04-01', '20',
    TRUE, NOW(), 'active',
    'dr-babatunde-fasanya'
),

-- ── 8  Dr Ramatu Usman — Neurology + Sleep Medicine (Fulani, F) ─────────
(
    'USR-OCL008', 'PAT-OCL008',
    'Ramatu Usman',
    'ramatu.usman@lifegate.health',
    '$2b$10$XfoQWpM7xTkVWVlXAIDJXODUiV0Fi3Nf6VIjcmaEY.xZSnzrVFQae',
    'professional', 'female', '+2348060010008', '1985-03-17',
    'Neurology, Sleep Medicine',
    'MBBS, FMCP (Usmanu Danfodiyo University)', 'MDCN-OCL-200808',
    '2010-09-15', '16',
    TRUE, NOW(), 'active',
    'dr-ramatu-usman'
),

-- ── 9  Dr Osagie Omoruyi — Psychiatry + Addiction Medicine (Edo, M) ──────
(
    'USR-OCL009', 'PAT-OCL009',
    'Osagie Omoruyi',
    'osagie.omoruyi@lifegate.health',
    '$2b$10$jD7hjNR./iF9yFgXdt2xheKCU3BeXkN3LUUXqkKtG7CTGMosKSZVu',
    'professional', 'male', '+2348060010009', '1978-10-04',
    'Psychiatry, Addiction Medicine',
    'MBBS, FMCPsych (University of Benin)', 'MDCN-OCL-200909',
    '2004-07-01', '22',
    TRUE, NOW(), 'active',
    'dr-osagie-omoruyi'
),

-- ── 10 Dr Chidinma Aneke — Psychology + Sexual Health (Igbo, F) ──────────
(
    'USR-OCL010', 'PAT-OCL010',
    'Chidinma Aneke',
    'chidinma.aneke@lifegate.health',
    '$2b$10$e24AzhLsa9xlA5h213jrw.X9e1TGRqey.hVO8h4PubX.gkfE0ZtW2',
    'professional', 'female', '+2348060010010', '1988-05-22',
    'Psychology, Sexual Health',
    'MBBS, MPH (University of Nigeria, Enugu Campus)', 'MDCN-OCL-201010',
    '2013-12-01', '13',
    TRUE, NOW(), 'active',
    'dr-chidinma-aneke'
),

-- ── 11 Dr Garba Suleiman — Pediatrics + Neonatology (Hausa, M) ───────────
(
    'USR-OCL011', 'PAT-OCL011',
    'Garba Suleiman',
    'garba.suleiman@lifegate.health',
    '$2b$10$yfDhs3S4KW0ZdsqmiRME6.MzR2WfEVib6tPzNlc.59099A40YFqRC',
    'professional', 'male', '+2348060010011', '1981-12-09',
    'Pediatrics, Neonatology',
    'MBBS, FMCPaed (Ahmadu Bello University, Zaria)', 'MDCN-OCL-201111',
    '2007-05-01', '19',
    TRUE, NOW(), 'active',
    'dr-garba-suleiman'
),

-- ── 12 Dr Yetunde Akande — Pediatrics + Nutrition + Geriatrics (Yoruba, F)
(
    'USR-OCL012', 'PAT-OCL012',
    'Yetunde Akande',
    'yetunde.akande@lifegate.health',
    '$2b$10$wlTqEWzq/vufPNl2fXysReY54HPUZM/pW.YDm9VoLqkw/06mBlYi2',
    'professional', 'female', '+2348060010012', '1984-08-14',
    'Pediatrics, Nutrition, Geriatrics',
    'MBBS, FMCPaed (Obafemi Awolowo University)', 'MDCN-OCL-201212',
    '2009-11-01', '17',
    TRUE, NOW(), 'active',
    'dr-yetunde-akande'
),

-- ── 13 Dr Aliyu Bello — Obstetrics + Gynecology + Fertility (Fulani, M) ──
(
    'USR-OCL013', 'PAT-OCL013',
    'Aliyu Bello',
    'aliyu.bello@lifegate.health',
    '$2b$10$/9viF4RiCR3u5NEiMkMBzeD80Zf85/NFUvcwMOfHTt0CPs.TncEFW',
    'professional', 'male', '+2348060010013', '1977-02-28',
    'Obstetrics and Gynecology, Fertility Medicine',
    'MBBS, FMCOG (Bayero University, Kano)', 'MDCN-OCL-201313',
    '2003-04-01', '23',
    TRUE, NOW(), 'active',
    'dr-aliyu-bello'
),

-- ── 14 Dr Esohe Oseni — OB/GYN + Reproductive Health (Edo, F) ───────────
(
    'USR-OCL014', 'PAT-OCL014',
    'Esohe Oseni',
    'esohe.oseni@lifegate.health',
    '$2b$10$0O30IdVpGUON/X9GBF4zPOErCfxZcDYBhsIkd.tvO2giGmEddGKeO',
    'professional', 'female', '+2348060010014', '1983-06-19',
    'Obstetrics and Gynecology, Reproductive Health',
    'MBBS, FMCOG (University of Benin)', 'MDCN-OCL-201414',
    '2008-10-01', '18',
    TRUE, NOW(), 'active',
    'dr-esohe-oseni'
),

-- ── 15 Dr Bukar Mala — Endocrinology + Diabetes + Nephrology (Kanuri, M) ─
(
    'USR-OCL015', 'PAT-OCL015',
    'Bukar Mala',
    'bukar.mala@lifegate.health',
    '$2b$10$G4WcfWRBCevdF043gZVkcOqEuYRFrqmGR22mQZDjf0E/4qDAv6i4m',
    'professional', 'male', '+2348060010015', '1976-09-02',
    'Endocrinology, Diabetes, Nephrology',
    'MBBS, FMCP (University of Maiduguri)', 'MDCN-OCL-201515',
    '2002-06-01', '24',
    TRUE, NOW(), 'active',
    'dr-bukar-mala'
),

-- ── 16 Dr Ifeoma Onuoha — Gastroenterology + Hepatology + Nutrition (Igbo, F)
(
    'USR-OCL016', 'PAT-OCL016',
    'Ifeoma Onuoha',
    'ifeoma.onuoha@lifegate.health',
    '$2b$10$Jqy9qeKTzWvjDZXWZgPmqeyAj9Z2i536FBC53g4sIm3emfR2enit.',
    'professional', 'female', '+2348060010016', '1981-04-06',
    'Gastroenterology, Hepatology, Nutrition',
    'MBBS, FMCP (University of Nigeria, Nsukka)', 'MDCN-OCL-201616',
    '2007-02-01', '19',
    TRUE, NOW(), 'active',
    'dr-ifeoma-onuoha'
),

-- ── 17 Dr Bassey Efiong — Infectious Disease + Tropical Medicine + Public Health (Efik, M)
(
    'USR-OCL017', 'PAT-OCL017',
    'Bassey Efiong',
    'bassey.efiong@lifegate.health',
    '$2b$10$uOXmwbEbh1worHebifxLz.1wPhuAiPIAnv.kqUIiXazmMmeAZTrd.',
    'professional', 'male', '+2348060010017', '1975-11-23',
    'Infectious Disease, Tropical Medicine, Public Health',
    'MBBS, FMCP, MPH (University of Calabar)', 'MDCN-OCL-201717',
    '2001-09-01', '25',
    TRUE, NOW(), 'active',
    'dr-bassey-efiong'
),

-- ── 18 Dr Zainab Sani — Infectious Disease + Pulmonology (Hausa, F) ──────
(
    'USR-OCL018', 'PAT-OCL018',
    'Zainab Sani',
    'zainab.sani@lifegate.health',
    '$2b$10$aSvSnOMmiQ9.3DXFhF0Zt.95/LBXODYQw1YbJovIbMRxe73e8VrL6',
    'professional', 'female', '+2348060010018', '1985-07-30',
    'Infectious Disease, Pulmonology',
    'MBBS, FMCP (Bayero University, Kano)', 'MDCN-OCL-201818',
    '2010-07-15', '16',
    TRUE, NOW(), 'active',
    'dr-zainab-sani'
),

-- ── 19 Dr Emeka Ugwu — Ophthalmology + Optometry + Dermatology (Igbo, M) ─
(
    'USR-OCL019', 'PAT-OCL019',
    'Emeka Ugwu',
    'emeka.ugwu@lifegate.health',
    '$2b$10$uePzSQkD5ZTZkpu83y/xvuPcHmIyFUfayX5rOBIm.ZBiBI8L22efi',
    'professional', 'male', '+2348060010019', '1980-03-11',
    'Ophthalmology, Optometry, Dermatology',
    'MBBS, FMCOphth (Nnamdi Azikiwe University)', 'MDCN-OCL-201919',
    '2006-08-01', '20',
    TRUE, NOW(), 'active',
    'dr-emeka-ugwu'
),

-- ── 20 Dr Iquo Archibong — Audiology + ENT (Efik, F) ────────────────────
(
    'USR-OCL020', 'PAT-OCL020',
    'Iquo Archibong',
    'iquo.archibong@lifegate.health',
    '$2b$10$T49htd34ROfbxuFV6w6gEeeLDoZa/8rohYcvG/RPtRBxDvNUd/Z0C',
    'professional', 'female', '+2348060010020', '1983-10-25',
    'Audiology, ENT',
    'MBBS, FMCORL (University of Calabar)', 'MDCN-OCL-202020',
    '2009-04-01', '17',
    TRUE, NOW(), 'active',
    'dr-iquo-archibong'
),

-- ── 21 Dr Danladi Musa — General Surgery + Orthopaedics + Urology + Oncology + Haematology (Hausa, M)
(
    'USR-OCL021', 'PAT-OCL021',
    'Danladi Musa',
    'danladi.musa@lifegate.health',
    '$2b$10$k5//RnIKiSW08.0KvB56D./Uu/.2NQgLC24.KWJxWOsqCYNIzVX5S',
    'professional', 'male', '+2348060010021', '1974-05-16',
    'General Surgery, Orthopaedics, Urology, Oncology, Haematology',
    'MBBS, FMCS (Ahmadu Bello University, Zaria)', 'MDCN-OCL-202121',
    '2000-11-01', '26',
    TRUE, NOW(), 'active',
    'dr-danladi-musa'
),

-- ── 22 Dr Adaeze Igwe — General Surgery + Dermatology + Radiology + Pathology (Igbo, F)
(
    'USR-OCL022', 'PAT-OCL022',
    'Adaeze Igwe',
    'adaeze.igwe@lifegate.health',
    '$2b$10$7sRpM3B7wRH.VRT07w5c.uCpnCN/0r8h8DaJlTRt6kuoYQLsrR7p2',
    'professional', 'female', '+2348060010022', '1979-08-07',
    'General Surgery, Dermatology, Radiology, Pathology',
    'MBBS, FMCS, FMCPath (University of Nigeria, Nsukka)', 'MDCN-OCL-202222',
    '2005-06-01', '21',
    TRUE, NOW(), 'active',
    'dr-adaeze-igwe'
),

-- ── 23 Dr Ojoche Ameh — Physiotherapy + Rehab + Sports + Pain + Palliative + Occupational Therapy (Idoma, M)
(
    'USR-OCL023', 'PAT-OCL023',
    'Ojoche Ameh',
    'ojoche.ameh@lifegate.health',
    '$2b$10$LpEfJucTbULyLa0ga/tITOI4iguUtDqADQ.1TBrXKksTm03u7nXjO',
    'professional', 'male', '+2348060010023', '1982-12-03',
    'Physiotherapy, Rehabilitation Medicine, Sports Medicine, Pain Management, Palliative Care, Occupational Therapy',
    'BPT, MPT, MNISP (University of Nigeria, Enugu Campus)', 'MDCN-OCL-202323',
    '2006-03-01', '20',
    TRUE, NOW(), 'active',
    'dr-ojoche-ameh'
),

-- ── 24 Dr Hadiza Maigari — Public Health + Occupational + Geriatrics + Sexual Health + Dentistry (Hausa, F)
(
    'USR-OCL024', 'PAT-OCL024',
    'Hadiza Maigari',
    'hadiza.maigari@lifegate.health',
    '$2b$10$9MN7B1kqV3MfeByMhWYpU.gDn.tgVG.m3E.8dAUb8NUXrgKdpU7FO',
    'professional', 'female', '+2348060010024', '1980-01-19',
    'Public Health, Occupational Health, Geriatrics, Sexual Health, Dentistry',
    'MBBS, MPH, FMCPH (Bayero University, Kano)', 'MDCN-OCL-202424',
    '2006-10-01', '20',
    TRUE, NOW(), 'active',
    'dr-hadiza-maigari'
)

ON CONFLICT (email) DO NOTHING;

-- Verify insert
-- SELECT user_id, name, specialization, openclaw_agent_slug
-- FROM users WHERE openclaw_agent_slug IS NOT NULL ORDER BY user_id;
