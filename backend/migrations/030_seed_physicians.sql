-- Migration 030: Seed 10 verified Nigerian physician accounts.
-- Specialty: General Medicine | Role: professional | MDCN verified: true
-- Default password: Doctor@LifeGate1  (rotate after first login)
-- Safe to re-run: INSERT … ON CONFLICT DO NOTHING.

INSERT INTO users (
    user_id, patient_id, name, email, password_hash,
    role, gender, phone, dob,
    specialization,
    certificate_name, certificate_id, certificate_issue_date,
    years_of_experience,
    mdcn_verified, mdcn_verified_at,
    account_status
) VALUES

-- ── Male physicians (5) ────────────────────────────────────────────────────

(
    'USR-NGA001', 'PAT-NGA001',
    'Chukwuemeka Okafor',
    'chukwuemeka.okafor@lifegate.health',
    '$2b$10$ln7Kw1rLzutIigVYP2sLZui5joZ75xl0J4Zr5zyi0CSn4EwizVony',
    'professional', 'male', '+2348031001001', '1982-03-14',
    'General Medicine',
    'MBBS (University of Nigeria Nsukka)', 'MDCN-NG-100101',
    '2008-07-01', '16',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA002', 'PAT-NGA002',
    'Babatunde Adeyemi',
    'babatunde.adeyemi@lifegate.health',
    '$2b$10$o0egOPFEiAuksOXqEjH59.EvPsLQmeDUG.feJg6ByRGfww0pcsYcS',
    'professional', 'male', '+2348031002002', '1979-11-22',
    'General Medicine',
    'MBBS (University of Lagos)', 'MDCN-NG-100202',
    '2005-09-01', '19',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA003', 'PAT-NGA003',
    'Aminu Musa Garba',
    'aminu.garba@lifegate.health',
    '$2b$10$nW5w4qA09toboDybLesYCOHdh4CW9Rl1bm9hbpieL0Q8kbjReB6RO',
    'professional', 'male', '+2348031003003', '1985-06-05',
    'General Medicine',
    'MBBS (Ahmadu Bello University)', 'MDCN-NG-100303',
    '2011-06-15', '13',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA004', 'PAT-NGA004',
    'Oluwaseun Adeleke',
    'oluwaseun.adeleke@lifegate.health',
    '$2b$10$rEPICTG2S8GXkj0LuQYr7.J.Ku0UlmGIuuB/e60kAGfhW6djkMpUi',
    'professional', 'male', '+2348031004004', '1988-01-30',
    'General Medicine',
    'MBBS (Obafemi Awolowo University)', 'MDCN-NG-100404',
    '2013-11-01', '11',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA005', 'PAT-NGA005',
    'Emeka Nwosu',
    'emeka.nwosu@lifegate.health',
    '$2b$10$z6h8MuKSyiDoagypwwPGr.QVDc4XuOKGcRDfANcTYk1ry.X3kghTq',
    'professional', 'male', '+2348031005005', '1983-08-17',
    'General Medicine',
    'MBBS (University of Benin)', 'MDCN-NG-100505',
    '2009-03-01', '15',
    TRUE, NOW(), 'active'
),

-- ── Female physicians (5) ──────────────────────────────────────────────────

(
    'USR-NGA006', 'PAT-NGA006',
    'Chidinma Okonkwo',
    'chidinma.okonkwo@lifegate.health',
    '$2b$10$lCefQx8VTaAVpbBk0dhmROhMreBHYiFaNc8R6U8VEL2Ujg1VDihjq',
    'professional', 'female', '+2348031006006', '1987-04-09',
    'General Medicine',
    'MBBS (University of Nigeria Nsukka)', 'MDCN-NG-100606',
    '2012-07-01', '12',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA007', 'PAT-NGA007',
    'Folake Adesanya',
    'folake.adesanya@lifegate.health',
    '$2b$10$swfu4GorLSYG6d/v36wnCeP7kEhmxBAEYWToo1PUtr50cfbbVmfDW',
    'professional', 'female', '+2348031007007', '1981-12-03',
    'General Medicine',
    'MBBS (University of Ibadan)', 'MDCN-NG-100707',
    '2007-04-01', '17',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA008', 'PAT-NGA008',
    'Amira Yusuf',
    'amira.yusuf@lifegate.health',
    '$2b$10$ITKqGGXDtM/hroucpVZaGuTrqHq4Wtz9cxDQ5KReu99xnt92wyRGe',
    'professional', 'female', '+2348031008008', '1990-09-25',
    'General Medicine',
    'MBBS (Bayero University Kano)', 'MDCN-NG-100808',
    '2015-01-01', '9',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA009', 'PAT-NGA009',
    'Ngozi Eze',
    'ngozi.eze@lifegate.health',
    '$2b$10$539/69o2ZNRZ1Fl5iKMa6Ob1dedmqUvA.fwasvUYlVyT4sNjtEecO',
    'professional', 'female', '+2348031009009', '1984-07-11',
    'General Medicine',
    'MBBS (Nnamdi Azikiwe University)', 'MDCN-NG-100909',
    '2010-08-01', '14',
    TRUE, NOW(), 'active'
),
(
    'USR-NGA010', 'PAT-NGA010',
    'Adaeze Okeke',
    'adaeze.okeke@lifegate.health',
    '$2b$10$Zyvh23615QHH32VihXxM4ehLQxWVq0VIY.aIp8r/tM2jzMj0EU1hm',
    'professional', 'female', '+2348031010010', '1986-02-19',
    'General Medicine',
    'MBBS (University of Port Harcourt)', 'MDCN-NG-101010',
    '2011-12-01', '13',
    TRUE, NOW(), 'active'
)

ON CONFLICT (email) DO NOTHING;
