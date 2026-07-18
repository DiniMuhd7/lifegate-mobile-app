-- Seed patient records from the July 2026 bulk registration list.
-- Rows without a complete name/age band/email/gender tuple are ignored.
-- Rows whose email values are syntactically invalid are ignored.
-- Duplicate emails are inserted once, and existing users are left untouched.

WITH raw_records(name, age_band, email, gender) AS (
  VALUES
    ('Muhammad Rasheed Usman Onoba', '18-24', 'rasheedrabiat@gmail.com', 'Male'),
    ('Sonia Mwalin Danborno', '18-24', 'Soniadanorno354@gmail.com', 'Female'),
    ('Fakayode Miracle Adegboyega', '25-34', 'miraclefak@gmail.com', 'Male'),
    ('Abdulazeez Abubakar Ibrahim', 'Under 18', 'abdulazeezabubakar896@gmail.com', 'Male'),
    ('Nwachukwu Precious', '18-24', 'pnwachukwu537@gmail.com', 'Female'),
    ('Aminu Mariam Timilehin', '25-34', 'aminumaryam2109@gmail.com', 'Female'),
    ('Babangida Suleiman', '25-34', 'suleimanbabangida090@gmail.com', 'Male'),
    ('Ameerah Abdul Waheed', '18-24', 'Amirahabdulwaheed9339@gmail.com', 'Female'),
    ('Omereonye Sharon', '18-24', 'Sharonngozi72@gmail.com', 'Female'),
    ('Ibrahim Muhammed jamiu', '25-34', 'godblessjamiu@gmail.com', 'Male'),
    ('Emmanuel Abuh', '18-24', 'emmycoolz126@gmail.com', 'Male'),
    ('Adebayo Khaosara Opeyemi', '18-24', 'Khaosaraopeyemi@gmail.com', 'Female'),
    ('Muhammed Amina zakari', '25-34', 'Aminazacks250@gmail.com', 'Female'),
    ('Ummulkhair mohammed', '18-24', 'Mohammedummulkhairl772@gmail.com', 'Female'),
    ('Sufyan Umar Faruk', '18-24', 'sufyanumarfaruk@gmail.com', 'Male'),
    ('Usman Usaina Mohammed', '18-24', 'usaina1044@gmail.com', 'Female'),
    ('Okoh Chimezirim R.', '18-24', 'okohmarvel4great@gmail.com', 'Male'),
    ('Abubakar Yau', '25-34', 'abubakaryaualhassan04@gmail.com', 'Male'),
    ('Abdulsalam hawau', '18-24', 'hawauabdulsalam78@gmail.com', 'Female'),
    ('Alameen yusuf', '18-24', 'yalameen90@gmail.com', 'Male'),
    ('Aminu yahaya', '18-24', 'yahayaminu14@gmail.com', 'Male'),
    ('Amodu Friday Omika', '18-24', 'otuyabenjamin2000@gmail.com', 'Female'),
    ('Mustapha Yusuf', '25-34', 'my3693260@gmail.com', 'Male'),
    ('Stephanie Samuel Bulus', '18-24', 'Pambisteph@gmail.com', 'Female'),
    ('Abubakar Musa Ibrahim', '25-34', 'musaibrahimabubakar23@gmail.com', 'Male'),
    ('Ameh Elizabeth', '18-24', 'elizabethameh68@gmail.com', 'Female'),
    ('Yakubu Maryam', '18-24', '025yakubumaryam@gmail.com', 'Female'),
    ('Fatima Abdullahi', '25-34', 'abteemah9@gmail.com', 'Female'),
    ('Fadila Usman', '25-34', 'fadeelahuthan97@gmail.com', 'Female'),
    ('Ibrahim Ibrahim', '18-24', 'ibrahimadeizaibrahim2023@gmail.com', 'Male'),
    ('IBRAHIM FATIMOH BAKO', '18-24', 'bakofatimoh@gmail.com', 'Female'),
    ('Oguche grace omo-ojo', '18-24', 'graceomojo830@gmail.com', 'Female'),
    ('Aliyu Muhammed Murtala', '25-34', 'binalhassan@gmail.com', 'Male'),
    ('Muhammad-Nasirdeen Zakiyyah', '18-24', 'muhammadzakiyyah33@gmail.com', 'Female'),
    ('Ifeanyi blessing adaeze', 'Under 18', 'blessingadaeze1616@gmail.com', 'Female'),
    ('Muhammad Sani Hamza', '25-34', 'sanihamzaelsan19@gmail.com', 'Male'),
    ('Hadiza habibu', '18-24', 'Hadizahabibu204@gmail.com', 'Female'),
    ('Hauwau Umar Abubakar', '18-24', 'hauwauumarabubakar229@gmail.com', 'Female'),
    ('Adebayo mayowa Godwin', '25-34', 'mayowaadebayo362@gmail.com', 'Male'),
    ('Fatima siyama benu', 'Under 18', 'benufatimasiyama@gmail.com', 'Female'),
    ('Muhammad Khadija kudu', '18-24', 'Muhammadkhadijahkudu@gmail.com', 'Female'),
    ('Fatima Abubakar', 'Under 18', 'Fatimadiamond2009@gmail.com', 'Female'),
    ('Lawal Rabiat', '18-24', 'lawalrabiat5@gmail.com', 'Female'),
    ('Muddassir Ibrahim', '18-24', 'muddassiribrahim61@gmail.com', 'Male'),
    ('Yakubu Zakari', 'Under 18', 'Yakubuzakariyakubuzakari570@gmail.com', 'Male'),
    ('Abdullah Zulaiha Bashir', '25-34', 'bashirzulaiha1@gmail.com', 'Female'),
    ('Maria Ossco', '25-34', 'mariajere1117@gmail.com', 'Female'),
    ('Osprey ummulkhair oyinlade', '18-24', 'Olorekhair@gmail.com', 'Female'),
    ('Enemali Mary', '45-54', 'Dinisoft.dev@gmail.com', 'Female'),
    ('Aisha Shauibu', '45-54', 'Dinisoft.dev@gmail.com', 'Female'),
    ('Muhammad Rabiu Abdu', '18-24', 'muhammadrabiuabdu@gmail.com', 'Male'),
    ('Maryam jimoh', '25-34', 'mimzeeljay@gmail.com', 'Female'),
    ('Fatima Saidu', '45-54', 'Dinisoft.dev@gmail.com', 'Female'),
    ('Abdulmajid zakariyau', '18-24', 'Abdulmajidzakariayau8@gmail.com', 'Male'),
    ('Patricia Okpokpo', '18-24', 'Patriciaokpokpo@gmail.com', 'Female'),
    ('Tanimonure Oreoluwa', '18-24', 'tanimonureoreoluwa@gmail.com', 'Female'),
    ('Usman Zulaikha', '18-24', 'zulaikhausman6@gmail.com', 'Female'),
    ('Oladiti justus', '18-24', 'Oluwolejustus@gmail.com', 'Male'),
    ('Ramlat H.Muhammed', '25-34', 'muhammadramlat62@gmail.com', 'Female'),
    ('Blessing Samuel', '25-34', 'blurvblurv@gmail.com', 'Female'),
    ('Onubaiye Yusuf musa', '25-34', 'Onubaiyeyusuf@gmail.com', 'Male'),
    ('Adah Patrick Bariyigakpoa', '18-24', 'kennysix777@gmail.com', 'Male'),
    ('Garba Abdulhanan Onoruoiza', '18-24', 'garbahanan@gmail.com', 'Male'),
    ('Yahya Jibril', '18-24', 'yahyajibril446@gmail.com', 'Male'),
    ('Nuruddeen Abdulwahab', '35-44', 'muhyiddeen1982@gmail.com', 'Male'),
    ('Madina abdulmalik', 'Under 18', 'Madinaabdulmalik@gmail.com', 'Female'),
    ('Lami Beatrice', '35-44', 'dinisoft.deva@gmail.com', 'Female'),
    ('Aisha Umar', '18-24', 'hauwauumarmkn@gmail.com', 'Female'),
    ('Mukhtar hauwau abubakar', '18-24', 'mukhtarhauwauabubakar@gmail.com', 'Female'),
    ('Kabir Zainab', 'Under 18', 'zk3944667@gmail.com', 'Female'),
    ('Isa nurudeen', '18-24', 'nurudeenisa87@gmail.com', 'Male'),
    ('Abdullahi Amina', '18-24', 'Meenahay002@gmail.com', 'Female'),
    ('Abdulhakeem Salahudeen', '18-24', 'salahudeenabdulhakeem1@gmail.com', 'Male'),
    ('Abdulmudalliph chola', '35-44', 'cabdulmudalliph@gmail.com', 'Male'),
    ('Buba Kehinde', '18-24', 'bubakehinde22@gmail.com', 'Female'),
    ('James ifeoma', '18-24', 'jamesifeoma134@gmail.com', 'Female'),
    ('Onuh Deborah ojochegbe', '18-24', 'Debbyonuh2002@gmail.com', 'Female'),
    ('Idris Khadeejah', '18-24', 'Omosiboqueenkj@gmail.com', 'Female'),
    ('Sabdat Muhammad yahuza', '18-24', 'Yahuzasaudat95@gmail.com', 'Female'),
    ('Adama fatima mama', '18-24', 'adamfatima705@gmail.com', 'Female'),
    ('Rahma Sani lawal', '18-24', 'lawalrahama10@gmail.com', 'Female'),
    ('Rabiu Yusra Abdulkadir', '18-24', 'yusrarabiuabdulkadir@gmail.com', 'Female'),
    ('Haruna Aisha', '18-24', 'harunaisha200@gmail.com', 'Female'),
    ('Idris Mariya Rufa''i', '18-24', 'Mariyaidrisrufai005@gmail.com', 'Female'),
    ('Andrews Lifted', '18-24', 'osinimuandrews@gmail.com', 'Male'),
    ('Iliyasu fatima', '18-24', 'iliyasufatima48@gmail.com', 'Female'),
    ('Adamu Lukman Maikilo', '25-34', 'luqmanmaikilo@gmail.com', 'Male'),
    ('Aisha Salahudeen Muhammad', '25-34', 'Salahudeenaisha024@gmail.com', 'Female'),
    ('Khadija ishaq', '18-24', 'khadijaishaq2007@gmail.com', 'Female'),
    ('Badamasi hamdallah', '18-24', 'Iretiolabadamasi2020@gmail.com', 'Female'),
    ('Nurudeen Khadijah', '18-24', 'nurudeenkhadijah5@gmail.com', 'Female'),
    ('Audu Gladys Lami', '18-24', 'gladysjoseph1674@gmail.com', 'Female'),
    ('Abdulfatah Haliya', '18-24', 'Call4haloyaaf@gmail.com', 'Female'),
    ('John Faith Joseph', '25-34', 'fayjayfjj@gmail.com', 'Female'),
    ('Yahaya Dauda', '25-34', 'Yahayadauda74@yahoo.com', 'Male'),
    ('Faith Abashi', '18-24', 'abashifaith3@gmail.com', 'Female'),
    ('Ismail balogun', '25-34', 'Ismailbalogz007@gmail.com', 'Male'),
    ('Aisha Idris Bature', '18-24', 'Aishabatureidris@gmail.com', 'Female'),
    ('Amazing grace Awaje Abu', '18-24', 'graceavezan@gmail.com', 'Female'),
    ('Usman Muhammad', '25-34', 'usmanabbadewu@gmail.com', 'Male'),
    ('Muhammad Maryam sani', '18-24', 'Maryammuhammadsani425@gmail.com', 'Female'),
    ('Zainab Muhammad inuwa', 'Under 18', 'Zainabmuhammadinuwakarim@gmail.com', 'Female'),
    ('Hassan Maryam', '18-24', 'Maryamhassanputme@gmail.com', 'Female'),
    ('Great chatcham Iliya', '18-24', 'greatdest111@gmail.com', 'Male'),
    ('Ayeni olusayo Musa', '25-34', 'Benjamindonald027@gmail.com', 'Male'),
    ('Abdulazeez Hamza Adeiza', '18-24', 'Hamzaadeizaa@gmail.com', 'Male'),
    ('Abdulrahman Amole shehu', '18-24', 'abdulrahmanshehu84@gmail.com', 'Male')

), additional_lines(line) AS (
  SELECT regexp_split_to_table($patient_records$
Aniedi okpo	35-44	okpoaniediabasi@gmail.com	Male
Adetomokun Clement Oluwadunsin	18-24	clementadetomokun@gmail.com	Male
Ephrain Musa	25-34	ephrainikelmusa@gmai.com	Male
Sharol Chikwendu	18-24	sharolchikwendu	Female
Isa Aisha Aminu	18-24	isaaishaa@gmail.com	Female
Abdullahi Sani	25-34	sanivocas2022@gmail.com	Male
isah maryam	18-24	maryamassadeeqaisah@gmail.com	Female
Salma Ahmad	18-24	ummarhsalmaahad@gmail.com	Female
Fatima Muhammad sani	18-24	Fmuhammadsani482@gmail.com	Female
Benjamin Blessing Ilu	18-24	benjaminblessing173@gmail.com	Female
Bashir Ali Garba	25-34	alibasheyr96@gmail.com	Male
Fatima salisu lawal	Under 18	Fatimasalisulawal1@gmail.com	Female
Nissi Awolu	18-24	injaseawolu@gmail.com	Female
Algeria Ezekiel	25-34	Ezekielalheri64@gmail.com	Female
Precioius Onoja Ojonudwa	18-24	preciousonoja556@gmail.coj	Female
Faith Samson	18-24	Fairhsamson816@mail.com	Female
Blessing Friday	Under 18	Andzutsiblessing@gamil.com	Female
Hafsat Muhammad Isah	18-24	hafsatmisah443@gmail.cojm	Female
Akpabio bestluck	Under 18	Missbestofficial@gmail.com	Female
Phoebe Stephen	18-24	PhoebeStephen73@gmail.com	Female
Abdulazeez Summey	Under 18	abdulazeezsumey80@gmail.com	Female
Suleiman	18-24	Suleimanadekanye32@gmail.com	Male
Yusuff aminat	Under 18	Aminatyusuf07@gmail.com	Female
Solomon isreal	25-34	Isrealsolomon04@gmail.com	Male
Abdulsalam Zubairu	Under 18	abdulsalamzubairu435@gmail.com	Male
Aliyu Usman gubuchi	18-24	Aliyugbc@gmail.com	Male
Jaafar ahmaf	25-34	Jaafarahamad8585@gmail.ocm	Male
Adeyemi Precio hius Ayomide	18-24	temilolaadeyemi05@gmail.com	Female
Zeenat Ahmed	18-24	zeenat4ril@gmail.com	Female
Abbas Hamza	18-24	Abbasinhamzah47	Male
Ojumu temidayo	Under 18	Ojumutemidayo@gmail.com	Female
Jemimah Damilola	18-24	damie623@gmail.com	Female
Amina Aliyu	18-24	Aminaaliyu898@gmail.com	Female
Musa zainab	18-24	Zeemusa024@gmail.com	Female
Abdallah Umar Maiyasin	Under 18	abdallahumarmaiyasin@gmail.com	Male
Zahra Balarabe	18-24	Zarabalarabe2023@gmail.com	Female
Adeyemo joy	18-24	damilolajoy037@gmail.com	Female
Suleiman naseer Yusuf	18-24	suleimannasiryusuf442@gmail.com	Male
Safiyya Sani	25-34	safiyyasani123@gmail.com	Female
Oyedepo Bukola	18-24	Kautharabdulwahab01@gmail.com	Female
Ezekiel Apollos	18-24	apollosezekiel3000@gmail.com	Male
Ilyasu Musa oke	25-34	Ilyasumusaoke@gmail.com	Male
Abubakar isah	18-24	abubakarisah3034@gmail	Male
Hauwau Bala marafa	18-24	Hauwabalamarafa@gmail.com	Female
Hussaini Sani Shuaibu	18-24	shuaibuhussainikgr@gmail.com	Male
Umar aminatu Abdullahi	18-24	Rahinatabdullahiumar@gmail.com	Female
Abdulhameed Quawiyyah	18-24	abdulhameedqo@gmail.com	Female
Emmanuel Yunana	18-24	emmanuelyunana73@gmail.com	Male
Omoyeni I. Caleb	25-34	omoyenii2018@gmail.com	Male
Muhammad mukhtar bello	18-24	mukhtarbello123@gmail.com	Male
Muhammed Habiba	18-24	ummaymanbintmuhammed@gmail.com	Female
Charles Sunday idoroyin	25-34	Idoreyincharles7@gmail.com	Male
Hassan Umar Muhammad	25-34	ibinustaz@gmail.com	Male
Hazmat ozigi	25-34	izaozigi@gmail.com	Male
Kamaludeen Ahmed Ovosi	Under 18	Kamalahmedovosi@gmail.com	Male
Jibril Maryam	18-24	maryamjibril2020@gmail.com	Female
Whala rodiat	25-34	Rodiatolami@gmail.com	Female
Lawal Hassan Abiodun	25-34	cizzelaw@gmail.com	Male
Lawal Umaymat	18-24	umaymatlawal@gmail.com	Female
Oladepo eniola Amina	18-24	aminatoladepo240@gmail.com	Female
Jamiu isah	18-24	Jamiuissabolaji2019@gmail.com	Male
Ruth Hassan	18-24	Hassanruthunekwuojo@gmail.com	Female
Ayeni Tajudeen Olasoji	25-34	ayenitajudeen8@gmail.com	Male
Ruqayya lawal haliru	18-24	lawalruqayya92@gmail.com	Female
Danjuna shehu	25-34	Danjumashehutilde@gmail.com	Male
Halima Abdul Isa	18-24	halimaandsadiya@gmail.com	Female
Abdulazeez Nafisat	Under 18	mailnafisatabdulazeez@gmail.com	Female
Royal Alex	18-24	royalalex001@gmail.com	Female
Aliya Muhammed Hassan	18-24	Muhammedaliya566@gmail.com	Female
Abdulrazak Ahmed	25-34	hammadariyo837@gmail.com	Male
Fatima Abdulrahman	18-24	abdulrahmanfatima860@gmail.com	Female
Yusuf isah	25-34	iyusufmashi@gmail.com	Male
Maryam yusuf	18-24	Incrediblemaryam222@gmail.com	Female
Yubusa rahmatu	Under 18	Yubusa rahma547@gmail.com	Female
Ajadi saheed	25-34	bayux521@gmail.com	Male
Omotosho maryam	18-24	Omotoshomaryam@gmail.com	Female
Joshul ishaku	18-24	Ishakujoshual9090@gmail.com	Male
Ahmad Fatima Abdullahi	18-24	ahmadfatima7461@gmail.com	Female
Aganran emmanuel Olayimika	18-24	aganranemma@gmail.com	Male
Isah Nusaiba	18-24	nusaybaisah39@gmail.com	Female
famakin Abdulwaasi Adekunle	25-34	famakinadulwasii5@gmail.com	Male
Ruqqayyah Hassan labo	18-24	Ruqqayyahlaboh@gmail.com	Female
Muhammed Suleiman	25-34	mohammedsuleiman811@gmail.com	Male
Fauziyya khalid	18-24	fauziyyakhalid77@gmail.com	Female
Salahudeen Khadijat	18-24	khadijatolamide@gmail.com	Female
Nafisat abdullahi	18-24	Feesatabdullahi41@gmail.com	Female
Habibah lukman	18-24	Habibahlukman43@gmail.com	Female
Amar bara'atu	18-24	Baraatuamar2001@gmail.com	Female
Ibrahim Abdulkadir	18-24	Khalifaaa702@gmail.com	Male
Aisha Abdulkadir	18-24	abdulkadirayush@gmail.com	Male
Rejoice Gambo	18-24	Rejoicegambo558@gmail.com	Female
Timothy iliya	18-24	Timothyiliya21@gmail.com	Male
Tahiru safirat	18-24	tahirusafiratu@gmail.com	Female
Nkechi anyigbo	18-24	Rhonockjnr@gmail.com	Female
Muhammad aliya	18-24	dogonyaro360@gmail.com	Male
Abbas mahmood	18-24	absonmahson001@gmail.com	Male
Fatima Abdulkadir	18-24	abdulkadiryammafatima@gmail.com	Female
Ugochukwu Sharon	18-24	Sharon4gold18@gmail.com	Female
Amar Bara'atu	18-24	baraatuamar2001@gmail.com	Female
Nafisah Suleiman	18-24	suleimannafisa93@gmail.com	Female
Yasir lawal	18-24	Lawalyasir700@gmail.com	Male
Sidikat ahmed	Under 18	sidikat.ahmed1@gmail.com	Female
suleiman Muhammad hayatudeen	18-24	hayatudeen36@gmail.com	Male
Yusuf Ladi Zainab	18-24	zaynaby1500@gmail.com	Female
Hauwa musa	18-24	maijiddambi91@gmail.com	Female
Nafisa Ibrahim lawal	18-24	Nilawal01@gmail.com	Female
Usman usman ishaq	18-24	adeiza851@gmail.com	Male
Aliyu mustafa	18-24	Aliyumustafa64@gmail.com	Male
Isah Khadija zuyeli	18-24	Isahkhadijah2001@gmail.com	Female
Habib sani turaki	18-24	habibusanituraki12@gmail.com	Male
Amina Isyaku Kuchi	18-24	amnaaht32@gmail.com	Female
Bilkisu Jaafar	18-24	Bilkisujaafaru@gmail. Cyo	Female
Mustapha Abubakar	18-24	Mustaphaabdulrahman77@gmail.com	Male
Rahila usman	18-24	Rahilalaila975@gmail.com	Female
Hephzibah Emmanuel	Under 18	ehephzibah1@gmail.com	Female
Mohammed alameen bala	25-34	alameen.mb4016@gmail.com	Male
Nanfe yarna	18-24	talktonanfe@gmail.com	Female
Haruna habib alhaji	18-24	Huranahabibalhaji@gmail.com	Male
Fadila lawal	Under 18	Fadilalawal1311@gmail.com	Female
Anas Tukur Ahmad	18-24	anastukurahmad2018@gmail.vom	Male
Ayuba musa	25-34	Musaayubatanko@gmail.com	Male
Wuseini uba	18-24	getuba25@gmail.com	Male
Philip Cornelius Naallah	25-34	Pexcellent5@gmail.com	Male
Bashirah oyiza yahaya	18-24	bashirahyahaya419@gmail.com	Female
David naomi	25-34	davidojonugwa95@gmail.com	Female
Buhari salisu koya	25-34	Buhariskoya@gmail.com	Male
Ibrahim Hafiza	18-24	hafizaibrahim146@gmail.com	Female
Ahmad fatidah	18-24	Fareedahahmad04@gmail.com	Female
Salamatu Mamman	18-24	Salamatumamman00@gmail.com	Female
Abdulmalik Maryam Mairo	18-24	abdulmalikmaryam21@gmail.com	Female
Abdulsalam Abdullahi	25-34	abdulsalamabdullahiskf@gmail.com	Male
Aisha sani	18-24	Asjet56@gmail.com	Female
Aisha Ahmed	18-24	Opeyemiaisha20@gmail.com	Female
Umar aminu sani	25-34	aminusaneeamsu@gmail.com	Male
usman Habiba gogo	18-24	usmanhabiba20@gmail.com	Female
Victoria Baba	25-34	Babavictorria30@gmail.com	Female
Nana Hauwau Abdulwaheed	18-24	Nanahauwauabdulwaheed@gmail.com	Female
Chukwueze Adanna Mabel	18-24	chinyereorji914@gmail.com	Female
Baki Sandra Philip	18-24	Sandrabaki@gmail.com	Female
Ibrahim Aisha	18-24	ibrahimaishatoday16@gmail.com	Female
Cordelia Ogbor Ilohioko	25-34	Cordeliaogbor027@gmail.com	Female
Salim Ahmad Aliyu	18-24	salimaliyu14@gmail.com	Male
Muhammad Hauwa	18-24	Hauwapatgi123456@g.com	Female
Alpheus oluwatoyin Deborah	18-24	Alpheuisreal8051@gmal.com	Female
Adamu Hafiz Lawal	18-24	Adamuhafeezlawa3422@gmail.com	Male
Hassan adelakin	18-24	Hasanadelakin@gmail.com	Male
Fawziyyah harun	18-24	fawzyharun@gmail.com	Female
Umar Hadiza Bologi	18-24	hadizaumar846@gmail.com	Female
Sakinat Idris	18-24	Idrissekinat720@gmail.com	Female
nasir khadijah	18-24	naseerkhadijat@gmail.com	Female
Yusuf sani	25-34	Saniyusufladan@gmail.com	Male
Halima saka ahmed	18-24	ahalimat742@gmail.com	Female
Jemila sani	18-24	jamilasani0000@gmail.com	Female
Tijani Aishat	18-24	taishat154@gmail.com	Female
Adebayo dorcas itunuoluwa	18-24	itunuoluwa456@g.mail.com	Female
Ibrahim Asiya	18-24	ibrahimasiya2003@gmail.com	Female
Adamu zainab	18-24	Blackbarbie2004@gmail.com	Female
Jibril aisha Alkali	18-24	aishajibrilalkali@gmail.com	Female
Suleiman huzaifa	18-24	Huzaifasuleiman150@gmail.com	Male
Tijani shefiyat oyiza	18-24	Shefyatijani@gmailcom	Female
Mustapha Ilyasu Hamza	18-24	mustaphailyasuhamza@gmail.com	Male
Monsur Saadatu Sheu	18-24	saadatumonsursheu@gmail.com	Female
Amodu faridat	18-24	amodufaridat76@gmail.com	Female
Lucy ofana	18-24	lucyofana@gmail.com	Female
Mariam isa	18-24	mariamisa718@gmail.com	Female
Aisha abdullahi lawal	Under 18	Umaimabdullahi94@gmail.com	Female
Sulaimon kayode	18-24	Ibrahimkayode2003@gmail.com	Male
Saliu hafsa	18-24	salhafsat05@gmail.com	Female
Muhammad Gambo	25-34	muhammadgambo09@gmail.com	Male
Shauibu babandi shauibu	25-34	Shuaibubabandi. ameer89@gmail.com	Male
Ahmad Asma'u Saleh	18-24	AsmauSaleh2004@gmail.com	Female
Mutmainnah Abdulmutalib	18-24	mutmainnahabdulmutalib@gmail.com	Female
Alhassan abdullahi	25-34	abdullahialhassan434@gmail.com	Male
iibrahim Muhammad	18-24	kingslayerib1@gmail.com	Male
Olabamiji josephine	18-24	Bukolaj23@gmail.com	Female
Abubakar abdullahi sokoto	18-24	abutalashe2@gmail.com	Male
Muhammed Ibrahim	18-24	Muhammedaleenabubakar@gmail.com	Male
Usman Umar Mohammad	25-34	usmanmb001@gmail.com	Male
Obed Haruna Masoyi	18-24	hobed1k@gmail.com	Male
Aisha Abubakar	18-24	abuausha0820@gmail.com	Female
Yusuf Hawau	18-24	Princesshawau21@gmail.com	Female
Aliyu Ahmad	25-34	Onimisiahmad19@gmail.com	Male
Abdul Malik Yusuf	18-24	Aybidemi2004@gmail.com	Male
olagunju mary oluwalobamisetemi	18-24	oluwalobamisetemi1012@gmail.com	Female
Kamal Shehu	18-24	shehukamal0216@gmail.com	Male
Ukanah Bernice Omewun	18-24	berniceukanah@gmail.com	Female
Kamardeen Khadijah Kubra	18-24	Kamardeenkhadijah@gmail.com	Female
James Okoh	18-24	iamjamesokoh@gmail.com	Male
Muhammad nafisat	18-24	mnofisat2@gmail.com	Female
Aisha Umar	18-24	Uaeeshat@gmail.com	Female
Abdulyeqeen Faridah	18-24	AdekemoAbdulyeqeen@gmail.com	Female
Muhammad Abubakar	18-24	rarerudi16@gmail.com	Male
Suleiman saheed ayoola	25-34	Suleimansaheed93@gmail.com	Male
Abdulazeez hanifat	18-24	abdulazeezhanifat83@gmail.com	Female
bashir hussaina saad	18-24	bashirsaadhussaina@gmail.com	Female
Abdulhaq Abdulkareem	18-24	Abdul haqAbdulkareem @123	Male
Fatima Ado Sani	18-24	adosanifatima0@gmail.com	Female
Peter Yangmen Daniel	18-24	Yangmedaniel@gmail.com	Male
Asiya Alhassan	25-34	dikkoasiya0@gmail.com	Female
lawal idris	25-34	lawalidris1050@gmail.com	Male
Fatima Abdullahi	18-24	Fatimaabdull022@gmail.com	Female
Mdadum Francis	25-34	francismdadum@gmail.com	Male
Victoria Anthony Ogbechia	18-24	Ogbechiavictoria@gmail.com	Female
Nurudeen Amina Abdulkareem	18-24	Aminanabdulkareem03@gmail.com	Female
Gloria ishaya	18-24	Ishayagloria1@gmail.com	Female
Aisha B saad	18-24	babangidaaisha002	Female
Aaliyah	18-24	ismailaaaliyah@gmail.com	Female
Favour Jaja	18-24	Favoromoja69@gmail.com	Female
Ahmed suleiman	18-24	arhmahd246@gmail.com	Male
Aminu kasim	25-34	Osagedekassim@gmail.com	Male
Ajegba mercy onyimowo	25-34	ajegbamercy@gmail.com	Female
Suleiman Babangida	25-34	Suleimanbabangida090@gmail.com	Male
Abdallah Layla	18-24	abdallahlayla79@gmail.com	Female
Muhammad Zainab	18-24	zee013@gmail.com	Female
Patience iliya	18-24	iliyapatience359@gmail.com	Female
Ẹne Ayegba	18-24	Eneemmmanuel@gmail.com	Female
Maryam onize yahaya	18-24	Maryamonize1@gmail.com	Female
Gift shepbel nanpo	18-24	Vsucem@gmail.com	Female
Hafsat Kaisan Muhammad	Under 18	KaisanMuhammad@gmail.com	Female
Naomi Moses	18-24	naomimoses193@gmail.com	Female
Unegbu blessing adanna	18-24	blessingunegbu88@gmail.com	Female
Ochai justina	25-34	Keemorah775@gmail.com	Female
Amira abdulfatai	18-24	Ameerahabdulfatai@yahoo.com	Female
Fadila Abdulrahman	18-24	Fadilaabdulrahman900@gmail.com	Female
Aliyi yunusa	25-34	aliyiyunusagwamna@gmail.com	Male
Magaji Rabiu Jonadab	18-24	magajijonadab@gmail.com	Male
Maryam kike lomo salaudeen	18-24	maryamsalau200@gmail com	Female
Mohammed zeenatu	18-24	zeenatm2001@gmail•com	Female
Abdulsalam yezeed	25-34	abdulsalamyezeed@gmail.com	Male
Abdul Malik sanni baba	25-34	Sanibabaabdulmalik@gmail.com	Male
Yusuf Ali	18-24	yusufalioladimeji2000@gmail.com	Male
Ahante Kesse Kelsy	18-24	Kelsyahante@gmail.com	Male
Musa Aliyu	25-34	_onawoscopy@gmail.com	Male
Kabir shamsiyya	25-34	Shamsiyatkabirasmau@gmail.com	Female
Saidu Zubar	18-24	saiduzubair1000gmail.com	Male
Uduakobong Jimmy	18-24	udyjimmy64@gmail.com	Female
Moshood sodiq olasunkanmi	18-24	Moshoodsodiq372@gmail	Male
Likita jennifer	18-24	Likitajennifer2@gmail.com	Female
Christian Ogoh Odaba	18-24	odabachristian022a2-	Male
Ogunleye Timilehin	18-24	ogunleyeaduragbemi04@gmail.com	Male
Yunusa farida	18-24	Yunusafarida55@gmail.com	Female
Tikau, Umar yahaya	18-24	Umar41042030@gmail.com	Male
Firdausi Mustapha	18-24	firdausimustapha72@gmail.com	Female
Gaduya Bayonga	18-24	bayongagaduya@gmail.com	Male
Aliyu zainab o	18-24	aleeyuzaynab350@gmail.com	Female
Muhammad Firdausi nana	18-24	nananfirdausimuhammad123@gmail.com	Female
Abdulrahman	55-64	abdullahiazegborgbo4@gmail.com	Male
Gladys Nkechi Amede	18-24	gladysamede@gmail.com	Female
Hussaina muhammad bello	18-24	Sadiyayakubu920@gmail.com	Female
Hassana Muhammad Bello	18-24	Sadiyayakubu920@gmail.com	Female
Musa Ndagiman	18-24	musandagiman@gmail.com	Male
Musa Hassan musa	25-34	Musahmusa1838@gmail.com	Male
Muhammad tanimu abubakar	18-24	Muhammadtanimu01@gmail.com	Male
Balkis Bashir	18-24	Bashirbalikis53@gmail.com	Female
Muhammad Khadija nasir	18-24	Khadijamuhammadnasir@gmail.com	Female
Ochigbo Elizabeth	25-34	ochigboelizabeth59@gmail.com	Female
Bilkisu usman	18-24	Usmanbalkisu3002@gma	Female
Ibrahim hannafi	18-24	Hannafi.himyat@gmail.com	Male
Aisha Musa Abubakar	18-24	aqaraye@gmai.com	Female
Fatima Abdulmumeen	18-24	FatimaAbdulmumeen2002@gmail.com	Female
Fatima Lamido Musa	18-24	lamidofatima50@gmail.com	Female
Praise musa yelwa	18-24	praisemusa51@gmail.com	Female
Obaje favour enechojo	Under 18	Enechojoobajefavour/@gmail.com	Female
Amina i saad	18-24	amina.isaad2304@gmail.com	Female
Lydia john	25-34	lydiajohniyoma@gmail.com	Female
Jennifer imogie	18-24	jennyimogie@gmail.com	Female
Isiak Rukayat	18-24	rukayatisiak123@yahoo.com	Female
Abdulazeez Auwal	18-24	abdulazizauwal124@gmail.com	Male
Dorcas Jeremiah	25-34	DorcasJeremiah81@gmail.com	Female
Ariyo oluwaseyi roseline	18-24	Oluwaseyiariyo783@gmail.com	Female
Usman naima	18-24	naimotusman@gmail.com	Female
Fatima gambo aliyu	18-24	aliyuf956@gmail.com	Female
Sabo Dongnaan Carritta	18-24	otushasabo@gmail.com	Female
Adewumi christianah	18-24	adewumichristianah27@gmail.com	Female
Samaila hannatu bahago	18-24	hannatubahago12@gmail.com	Female
Mamudu Rabi Muktar	18-24	muktarmamudurabi@gmail.com	Female
Halimat Bashiru	18-24	halimatbashir2020@gmail.com	Female
Abubakar Adamu	25-34	Abubakaradamu3353@gmail.com	Male
Aro kikelomo	18-24	arokikelomo@gmail.com	Female
Alexander Nanpan	25-34	lexsam02@gmail.com	Male
Saliu, Binta Ometere	25-34	beentasaliu@gmail.com	Female
Abdulrahman bashir	18-24	abdulrahmanbashir024@gmail.com	Male
Silver ngodoo tyokosu	18-24	Styokosu@gmail.com	Female
Omowumi olorunleke	35-44	olorunlekeomowunmi@gmail	Female
Ofre Precious	18-24	Preciousofre711@gmail.com	Male
Bello Rukaya	25-34	Bellorukayat963@gmail.com	Female
Maimuna Musa	18-24	No 39 bagana street rigasa kaduna state	Female
Mamodu Success Sunday	25-34	Successmamodu209@gmail.com	Male
Abdulazeez Faridat Keji	18-24	Faridatazeez2004@gmail.com	Female
Saliu Rabiat	25-34	rabiatsaliu88@gmail.com	Female
Sadiya ummi rabiu	18-24	Safiyahrabiu8@gmail.com	Female
Danilola kolawole	18-24	Kdamilola982@gmail.com	Female
Simbiyat ovayioza	18-24	ozinahuntu@gmail.com	Female
Musa Samuel zakariah	18-24	musasamuel064@gmail.com	Male
Omale favour	Under 18	Favouromale32@gmail.com	Female
Precious titilope raji	18-24	Rajiprecious747@gmail.com	Female
Mohammed Salamatu	18-24	Salamatumohammed727@gmail.com	Female
Yahaya Abubakar	18-24	muazinuna@gmail.com	Male
Apochi Amina Favour	18-24	Apochifavour03@gmail.com	Female
Fatima Alhassan	18-24	teemerhhassan004@gmail.com	Female
Safiyyah sulaiman	35-44	No6 Anguwan kaya zaria	Female
Ado Yelwa Rabi	18-24	rabiadoyelwa@gmail.com	Female
Joseph faith ijeanu	18-24	faithijeanu@gmail.com	Female
Deborah	18-24	debby15ukanah@gmail.com	Female
Buhari shuaibu	25-34	Buharishuaibu577@gmail.com	Male
Abdufatai Madinat Abimbola	18-24	bambioyebode@gmail.com	Female
Ansharu Abdulkarim	18-24	abdulkarimansharu@gmail.com	Male
Oyelami Gideon bunmi	25-34	bunmeey1@gmail.com	Male
Bala moses	25-34	Mosesbala987@gmail.com	Male
Nathaniel divine	18-24	nathanieldivine1@gmail.com	Male
Comfort Samaila	18-24	comfortsamaila253@gmail.com	Female
Olabode Praise Ewaoluwa	18-24	praisewealth247@gmail.com	Female
Danlami Gloria aliyu	18-24	gloriadanlamiali@gmail.com	Female
Yakubu Ibrahim Madaki	25-34	ibrahimmadaki000@gmail.com	Male
Ahmed abubakar rufai	25-34	Ahmadabubakarruf@gmail.com	Male
Onah marypeace ochanya	18-24	Marypeaceonah8@gmail	Female
Amidu Zainab Bolanle	25-34	amiduzainab3@gmail.com	Female
Fatimah mukhtar	18-24	Saadatumadaki@gmail.com	Female
Amina Muhammed	25-34	aminamuhammedless@gmail.com	Female
Agboola Adegboye	18-24	08140750305a@gmail.com	Male
Taibat abdulra'uf	Under 18	Taibatmahmud@gmail.com	Female
Abdullahi Haruna Isah	18-24	abdullahiisah2802@gmail.com	Male
Ibrahim Abdul Malik	18-24	Ibrother1236@gmail.com	Male
Suleiman faizat bake	18-24	faizatsuleiman05@gmail.com	Female
Odeoba oriyomi Gloria	18-24	Odeobaoriyomi1210@gmail.com	Female
Christiana Eleojo Haruna	18-24	harunachristiana052@gmail.com	Female
Nissi Ibrahim	18-24	ibrahimonimissi@gmail.com	Male
Abdulaziz Nabilat	18-24	balogunnabila1@gmail.com	Female
Kuku busayo	18-24	kibalt757@gmail.com	Female
lawal halima ohunene	35-44	halimatohunene639@gmail.com	Female
Nufashatu muntaka	18-24	Nufashatumurtala@gmail.com	Female
Fauziya lapinni	Under 18	lapinnizeeyah@gmail.com	Female
Victor sanda	18-24	Victorsanda420@gmail.com	Male
Peace john	18-24	Peacejohn600@gmail.com	Female
Tahir Muhammad Zainab	18-24	Tahirmuhammedzainab@gmail.com	Female
Zubair hameedat	18-24	Hameedatzubair798@gmail.com	Female
Onaji Justina ojo	18-24	Onajijustina6655@gmail.com	Female
Fatima Nazir Ibrahim	18-24	inazirfatima655@gmail.com	Female
Abdullahi rabiu Yusuf	18-24	Abdulyusrab1329@mail.com	Female
Peter adanu	25-34	Adenupeter@gmail.com	Male
Binta suleiman ojoma	18-24	Bintasuleiman27@gmail.com	Female
Mercy idoko	25-34	Idokomercy1999@gmail.com	Female
Ayodele Omobolanle	18-24	Ibukunoluwaomobolanle77@gmail.com	Female
Luka blessing	25-34	blessingkuyet99	Female
Usakahyel	18-24	Usakahyelzharkahyel@gmail.com	Male
Anthony Jeremiah	25-34	Marvexj48@gmail.com	Male
Ibrahim Saeed	18-24	siomar225@gmail.com	Male
Mohammed Mufrad Hassan	18-24	mohammedmufrad@gmail.com	Female
Ridwan jumai	18-24	Riddywhanadio@gmail.com	Male
Lawal Khadijat	18-24	lawalkhadijah112@gmail.com	Female
Mas'ud Arafat	18-24	arafahmasud3@gmail.com	Female
Ishaq Habeebat Bukola	18-24	habeebat42020@gmail.com	Female
$patient_records$, E'\n')
), additional_records AS (
  SELECT split_part(line, E'\t', 1) AS name,
         split_part(line, E'\t', 2) AS age_band,
         split_part(line, E'\t', 3) AS email,
         split_part(line, E'\t', 4) AS gender
  FROM additional_lines
  WHERE line LIKE '%' || E'\t' || '%'
), all_records AS (
  SELECT * FROM raw_records
  UNION ALL
  SELECT * FROM additional_records
), cleaned AS (
  SELECT DISTINCT ON (LOWER(TRIM(email)))
         TRIM(name) AS name,
         TRIM(age_band) AS age_band,
         LOWER(TRIM(email)) AS email,
         INITCAP(LOWER(TRIM(gender))) AS gender
  FROM all_records
  WHERE NULLIF(TRIM(name), '') IS NOT NULL
    AND NULLIF(TRIM(age_band), '') IS NOT NULL
    AND NULLIF(TRIM(email), '') IS NOT NULL
    AND NULLIF(TRIM(gender), '') IS NOT NULL
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
