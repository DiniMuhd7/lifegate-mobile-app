-- Seed additional Span v1 patient records from the July 2026 bulk registration list.
-- Rows without a usable email address are ignored. Duplicate emails are inserted once.
-- When age band or gender were not supplied in the source list, dob/gender are left NULL.

WITH raw_records(name, age_band, email, gender) AS (
  VALUES
    ('Wilfred agubamah', '18-24', 'Wilfredagubamah@gmail.com', 'Male'),
    ('Abdulrasheed khadijat akorede', '18-24', 'khayhay015@gmail.com', 'Female'),
    ('Afolabi Matthew', '18-24', 'labimatthew@gmail.com', 'Male'),
    ('Hammed suleiman Adonoyi', '25-34', 'Hammedas789@gmail.com', 'Male'),
    ('Umosen nize ine', '18-24', 'Umosenime325@gmail.com', 'Female'),
    ('Joy Peter', '18-24', 'Peterjoy101425@gmail.com', 'Female'),
    ('Anas Haruna', '25-34', 'engineertakai@gmail.com', 'Male'),
    ('Mohammad Hauwau Dawood', '18-24', 'hauwamdawood@gmail.com', 'Female'),
    ('Salma rabiuabdulkadir', '18-24', 'Salmarabiuabdulkadiir@gmail.com', 'Female'),
    ('Fatima bukar', '18-24', 'Fatimabukar251@gmail.com', 'Female'),
    ('TAHIRU BESHIRU', '25-34', 'beshirutahiru998@gmail.com', 'Male'),
    ('Khalisa usman', '18-24', 'khalisausman01@gmail.com', 'Female'),
    ('Eseyin Abayomi Emmanuel', '25-34', 'emmanuelabayomi2121@gmail.com', 'Male'),
    ('Samson Bitrus visa', '35-44', 'samsonbitrusvisa@gmail.com', 'Male'),
    ('Idakoriko Bilikis Ize', '18-24', 'izebilikis@gmail.com', 'Female'),
    ('Yunusa Ramotu', '18-24', 'yunusaramotu547@gmail.com', 'Female'),
    ('Igah Favour Ada', '18-24', 'favourigah2020@gmail.com', 'Female'),
    ('Oyewumi Victor Olanrewaju', '18-24', 'victorlanrewaju01@gmail.com', 'Male'),
    ('Abdullahi Abubakar', '25-34', 'abdullahiabubakar352@gmail.com', 'Male'),
    ('Adam Balogun Opeyemi', '25-34', 'ope4balo@gmail.com', 'Male'),
    ('Mustapha Muhammed Alilu', '18-24', 'Mustaphamusty177@gmail.com', 'Male'),
    ('Shuaibu Fatima Imam', '18-24', 'shuaibufatimaimam@gmail.com', 'Female'),
    ('Abdulazeez Hamza', '18-24', 'hamzaadeizaa@gmail.com', 'Male'),
    ('Overview Chinyere', '18-24', 'Chinyereokereke018@gmail.com', 'Female'),
    ('Aliyu umar faruk', '18-24', 'Faruqaliyu865@gmail.com', 'Male'),
    ('Olowosulu Elizabeth irewole', '18-24', 'elizabetholowosulu@gmail.com', 'Female'),
    ('Kehinde bukola', '18-24', 'Suzzanbukola3@gmail.com', 'Female'),
    ('Mathias Amed', '35-44', 'dinisoft.dev@gmail.com', 'Male'),
    ('Doris Dalyop', '18-24', 'dorisdalyop@gmail.com', 'Female'),
    ('Umogbai Sonia', '18-24', 'umogbaisonia@gmail.com', 'Female'),
    ('Gaiya Catherine', '25-34', 'gaiyacheryl@gmail.com', 'Female'),
    ('David Genevieve sim', '18-24', 'davidgenevieve67@gmail.com', 'Female'),
    ('Ezekiel Diana', '18-24', 'ezekieldiana08@gmail.com', 'Female'),
    ('David Ogoh Okoh', '18-24', 'Okohdave908@gmail.com', 'Male'),
    ('Ojochebo ogbadu', '18-24', 'Only.chebo@gmail.com', 'Male'),
    ('Favour Abel', '18-24', 'favourabel466@gmail.com', 'Female'),
    ('Laah keziah', '18-24', 'Keziahlaah77@gmail.com', 'Female'),
    ('SIMON DOGO SHESHI', '25-34', 'simondogosheshi@gmail.com', 'Male'),
    ('Ibrahim Mallam Aliyu', '25-34', 'mallam4ibrahim@gmail.com', 'Male'),
    ('Inuwa Mohammed usman', '18-24', 'Usmanmuhammadinuwa219@gmail.com', 'Male'),
    ('Gift Anayo', '18-24', 'Onyeinyechianayo@gmail.com', 'Female'),
    ('Suleiman Amina', '25-34', 'Suleimanamina214@gmail.com', 'Female'),
    ('Faiza Yusuf', '18-24', 'Faizacoyusuf@gmail.com', 'Female'),
    ('Abbas Maryam', '25-34', 'mabbas0605@gmail.com', 'Female'),
    ('ABUBAKAR TAHIRAH ASABE', '18-24', 'tahiraabubakar2@gmail.com', 'Female'),
    ('Ishaya Martins kamai', '25-34', 'ishaya041@gmail.com', 'Male'),
    ('Olajumoke Odetayo', '25-34', 'christexx01@gmail.com', 'Female'),
    ('Yahaya Fatimatulbatool Oyizami', 'Under 18', 'yahayafatimat232@gmail.com', 'Female'),
    ('John Attah', '35-44', 'jsattah06@gmail.com', 'Male'),
    ('Clara osikha', '18-24', 'emmcla2@gmail.com', 'Female'),
    ('Abdulrazak Khadijat', NULL, 'kkhadijat225@gmail.com', NULL),
    ('Imran Iliyas', NULL, 'imranailiyasu63@gmail.com', NULL),
    ('Abah Veronica', NULL, 'vabah699@gmail.com', NULL),
    ('maduba Danladi', NULL, 'maduba45@gmail.com', NULL),
    ('haruna abubakar', NULL, 'harunaabubakarmazari@gmail.com', NULL),
    ('Bello Awwal', NULL, 'belloawwal00@gmail.com', NULL),
    ('hauwa shuaiba', NULL, 'hshuaibu38@gmail.com', NULL),
    ('abdullahi muhammad falalu', NULL, 'falaluabdullahimuhammad0@gmail.com', NULL),
    ('lilian iwuji', NULL, 'lilianaloysuis@gmail.com', NULL),
    ('abdullahi rukkaiy garba', NULL, 'abdullahirukaiyagarba62@gmail.com', NULL),
    ('garuba moshood ajadi', NULL, 'moshooodajadi2@gmail.com', NULL),
    ('hafsat muktar kaigama', NULL, 'hafsatmuktarkaigama@gmail.com', NULL),
    ('Maryam Sani', NULL, 'maryamsani9682@gmail.com', NULL),
    ('Susan Micheal', NULL, 'susannamicheal8@gmail.com', NULL),
    ('Moses Manasseh', NULL, 'ochoyodam2@gmail.com', NULL),
    ('Zion Olumide', NULL, 'zionolumide1@gmail.com', NULL),
    ('Hafsat Ahmad Kalmalo', NULL, 'hafsatahmadkalmalo@gmail.com', NULL),
    ('Ibrahim Zulaihat', NULL, 'izulaihat536@gmail.com', NULL),
    ('Manasseh Benedict', NULL, 'manassehbenedict37@gmail.com', NULL),
    ('Precious Olatunde', NULL, 'preciousolahmicheals@gmail.com', NULL),
    ('Iornongu Msughter', NULL, 'solomoniornongu25@gmail.com', NULL),
    ('Gloria David', NULL, 'glodavid150@gmail.com', NULL),
    ('Abdulfatai Yakubu', NULL, 'yakubuabdulfatai32@gmail.com', NULL),
    ('Danjuma Gloria', NULL, 'gloriadanjuma123@gmail.com', NULL),
    ('Monica Haruna', NULL, 'moniharu25@gmail.com', NULL),
    ('Muhsina Aliyu', NULL, 'muhsinaaliyu2@gmail.com', NULL),
    ('Musa Ibrahim', NULL, 'mibamalli68@gmail.com', NULL),
    ('Firdausi Nuraddeen Ismail', NULL, 'firdausinuraddeenismail@gmail.com', NULL),
    ('Musa Dalhatu Khairr', NULL, 'mdalhat@gmail.com', NULL),
    ('Muhammad Lawal Dikko', NULL, 'dikkolawal60@gmail.com', NULL),
    ('Jamiu Olatunde', NULL, 'kamaldeenmuhammed3@gmail.com', NULL),
    ('Favour Hanna Ibrahim', NULL, 'ibrahimfavour274@gmail.com', NULL),
    ('Herbert Treasure', NULL, 'godselectherbert@gmail.com', NULL),
    ('Jibril Tanimu Musa', NULL, 'jibriltanimumusa@gmail.com', NULL),
    ('Shamsudeen Ahmed', NULL, 'Shamsudeenahmed08@gmail.com', NULL),
    ('Idongesit ilIniouong', NULL, 'effionjidongesit635@gmail.com', NULL),
    ('Emanuel Lena Naomi', NULL, 'lenaemmanuel00@gmail.com', NULL),
    ('Stephanie Ogundiran', NULL, 'Stephanieogundiran75@gmail.com', NULL),
    ('Aliyu Haruna', NULL, 'ibrahimaliyuhydar@gmail.com', NULL),
    ('Akanbi Sodiq', NULL, 'akanbisodiq13@gmail.com', NULL),
    ('Magdaline Yohanna', NULL, 'magdalineyohanna088@gmail.com', NULL),
    ('Maryam Abubakar', NULL, 'maryamabubakar.00642@gmail.com', NULL),
    ('Haziary Ibrahim akanbi', NULL, 'haziaryi@gmail.com', NULL),
    ('Abdulmalik Abubakar Alkali', NULL, 'abdulmalikalkaliabubakar@gmail.com', NULL),
    ('Favour Sim Sati', NULL, 'satifavour59@gmail.com', NULL),
    ('Best luck', NULL, 'bestluckakpabio4@gmail.com', NULL),
    ('Aminu Ishaq', NULL, 'aminshaq01@gmail.com', NULL),
    ('Ahmed Zubair', NULL, 'zubairahmad2861@gmail.com', NULL)
), cleaned AS (
  SELECT DISTINCT ON (LOWER(TRIM(email)))
         TRIM(name) AS name,
         NULLIF(TRIM(age_band), '') AS age_band,
         LOWER(TRIM(email)) AS email,
         NULLIF(INITCAP(LOWER(TRIM(gender))), '') AS gender
  FROM raw_records
  WHERE NULLIF(TRIM(name), '') IS NOT NULL
    AND NULLIF(TRIM(email), '') IS NOT NULL
    AND LOWER(TRIM(email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  ORDER BY LOWER(TRIM(email)), name
)
INSERT INTO users (name, email, password_hash, role, dob, gender, language)
SELECT name,
       email,
       '$2a$10$CwTycUXWue0Thq9StjUM0uJ8RRCfD.tI3/GRiJk1mA5mQnGTN.Kyi',
       'patient',
       CASE age_band
         WHEN 'Under 18' THEN '2010-01-01'
         WHEN '18-24' THEN '2004-01-01'
         WHEN '25-34' THEN '1996-01-01'
         WHEN '35-44' THEN '1986-01-01'
         WHEN '45-54' THEN '1976-01-01'
         WHEN '55-64' THEN '1966-01-01'
         ELSE NULL
       END,
       gender,
       'English'
FROM cleaned c
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE LOWER(u.email) = c.email
);
