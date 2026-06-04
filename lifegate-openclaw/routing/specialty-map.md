# SPECIALTY MAP
## LifeGate OpenClaw | Symptom → Specialisation Routing Table

---

## Overview

This map defines the keyword-to-specialisation routing rules used by the
Routing Engine. When EDIS produces a differential, each condition is matched
against this table to identify the correct physician agent.

---

## Primary Routing Map

| Symptom / Condition Keywords                          | Primary Agent                          | Secondary Agent                    |
|-------------------------------------------------------|----------------------------------------|------------------------------------|
| chest pain, palpitations, shortness of breath         | Dr. Ibrahim Danladi (Cardiology)       | Dr. Terseer Tyav (Emergency)       |
| hypertension, high blood pressure                     | Dr. Ibrahim Danladi (Cardiology)       | Dr. Ahmed Musa (General Medicine)  |
| stroke, facial droop, limb weakness, slurred speech   | Dr. Babatunde Fasanya (Neurology)      | Dr. Terseer Tyav (Emergency)       |
| seizure, convulsion, epilepsy, fits                   | Dr. Babatunde Fasanya (Neurology)      | Dr. Terseer Tyav (Emergency)       |
| headache, migraine, dizziness                         | Dr. Babatunde Fasanya (Neurology)      | Dr. Ahmed Musa (General Medicine)  |
| sleep disturbance, insomnia, sleep apnoea             | Dr. Ramatu Usman (Sleep Medicine)      | Dr. Osagie Omoruyi (Psychiatry)    |
| depression, anxiety, mood, suicidal, mental health    | Dr. Osagie Omoruyi (Psychiatry)        | Dr. Chidinma Aneke (Psychology)    |
| substance abuse, addiction, alcohol use               | Dr. Osagie Omoruyi (Addiction)         | Dr. Chidinma Aneke (Psychology)    |
| fever, malaise, body pain, fatigue                    | Dr. Ahmed Musa (General Medicine)      | Dr. Bassey Efiong (Infectious Dis) |
| malaria, typhoid, fever + chills                      | Dr. Bassey Efiong (Tropical Medicine)  | Dr. Ahmed Musa (General Medicine)  |
| HIV, TB, tuberculosis, sexually transmitted           | Dr. Bassey Efiong (Infectious Disease) | Dr. Zainab Sani (Infectious Dis)   |
| cough, breathlessness, wheeze, pneumonia              | Dr. Zainab Sani (Pulmonology)          | Dr. Bassey Efiong (Infectious Dis) |
| pregnancy, antenatal, obstetric, labour               | Dr. Aliyu Bello (Obstetrics)           | Dr. Esohe Oseni (Obstetrics)       |
| vaginal bleeding, pelvic pain, menstrual              | Dr. Esohe Oseni (Gynaecology)          | Dr. Aliyu Bello (Obstetrics)       |
| infertility, conception difficulty                    | Dr. Aliyu Bello (Fertility Medicine)   | Dr. Esohe Oseni (Gynaecology)      |
| diabetes, blood sugar, insulin, HbA1c                 | Dr. Bukar Mala (Diabetes Care)         | Dr. Ahmed Musa (General Medicine)  |
| thyroid, weight gain/loss unexplained, fatigue        | Dr. Bukar Mala (Endocrinology)         | Dr. Ahmed Musa (General Medicine)  |
| kidney disease, creatinine high, renal failure        | Dr. Bukar Mala (Nephrology)            | Dr. Ibrahim Danladi (Cardiology)   |
| abdominal pain, diarrhoea, bowel changes              | Dr. Ifeoma Onuoha (Gastroenterology)   | Dr. Ahmed Musa (General Medicine)  |
| jaundice, liver pain, hepatitis                       | Dr. Ifeoma Onuoha (Hepatology)         | Dr. Bassey Efiong (Infectious Dis) |
| weight loss, poor nutrition, malnutrition             | Dr. Ifeoma Onuoha (Nutrition)          | Dr. Yetunde Akande (Paediatrics)   |
| child health, paediatric, growth, vaccination         | Dr. Garba Suleiman (Paediatrics)       | Dr. Yetunde Akande (Paediatrics)   |
| newborn, neonatal, NICU                               | Dr. Garba Suleiman (Neonatology)       | Dr. Yetunde Akande (Paediatrics)   |
| eye pain, blurry vision, visual loss                  | Dr. Emeka Ugwu (Ophthalmology)         | —                                  |
| hearing loss, ear pain, tinnitus, ringing ears        | Dr. Iquo Archibong (Audiology/ENT)     | —                                  |
| sore throat, runny nose, sinusitis                    | Dr. Iquo Archibong (ENT)               | Dr. Ahmed Musa (General Medicine)  |
| skin rash, lesion, itching, pigmentation              | Dr. Emeka Ugwu (Dermatology)           | Dr. Adaeze Igwe (Surgery/Derm)     |
| joint pain, back pain, arthritis                      | Dr. Adaeze Nwosu (Rheumatology)        | Dr. Ojoche Ameh (Physiotherapy)    |
| injury, fracture, trauma, sports                      | Dr. Danladi Musa (Orthopaedics)        | Dr. Ojoche Ameh (Sports Medicine)  |
| lump, mass, cancer concern, tumour                    | Dr. Danladi Musa (Oncology)            | Dr. Adaeze Igwe (Surgery)          |
| blood disorder, anaemia, sickle cell, bleeding        | Dr. Danladi Musa (Haematology)         | Dr. Ahmed Musa (General Medicine)  |
| chronic pain, pain management                         | Dr. Ojoche Ameh (Pain Management)      | —                                  |
| rehabilitation, post-stroke, physiotherapy            | Dr. Ojoche Ameh (Rehabilitation)       | —                                  |
| occupational injury, workplace health                 | Dr. Ojoche Ameh (Occupational Health)  | Dr. Hadiza Maigari (Public Health) |
| palliative, terminal illness, end of life             | Dr. Ojoche Ameh (Palliative Care)      | Dr. Hadiza Maigari (Public Health) |
| sexual health, STI, contraception                     | Dr. Chidinma Aneke (Sexual Health)     | Dr. Hadiza Maigari (Public Health) |
| elderly, geriatric, ageing, dementia                  | Dr. Yetunde Akande (Geriatrics)        | Dr. Hadiza Maigari (Public Health) |
| dental pain, toothache, gum disease                   | Dr. Hadiza Maigari (Dentistry)         | —                                  |
| community health, public health, outbreak             | Dr. Hadiza Maigari (Public Health)     | Dr. Bassey Efiong (Tropical Med)   |
| imaging result, X-ray, CT, MRI, ultrasound            | Dr. Adaeze Igwe (Radiology)            | —                                  |
| biopsy result, histology, pathology report            | Dr. Adaeze Igwe (Pathology)            | Dr. Danladi Musa (Oncology)        |
| telemedicine, virtual consultation, handoff           | Dr. Bukola Adesanya (Telemedicine)     | —                                  |
| AI validation, low confidence, uncertain triage       | Dr. Ngozi Okafor (AI Validation)       | consensus_engine                   |

---

## Multi-Specialty Routing Triggers

Some presentations require MULTIPLE agents simultaneously:

| Presentation                                 | Agents Involved                                            |
|----------------------------------------------|------------------------------------------------------------|
| Chest pain + ECG changes                     | Dr. Ibrahim Danladi + Dr. Terseer Tyav                     |
| Pregnancy + hypertension                     | Dr. Aliyu Bello + Dr. Ibrahim Danladi                      |
| Diabetes + kidney disease                    | Dr. Bukar Mala (both Endo + Nephro)                        |
| Depression + insomnia                        | Dr. Osagie Omoruyi + Dr. Ramatu Usman                      |
| Stroke presentation                          | Dr. Babatunde Fasanya + Dr. Terseer Tyav                   |
| Paediatric emergency                         | Dr. Garba Suleiman + Dr. Terseer Tyav                      |
| Cancer + pain management                     | Dr. Danladi Musa + Dr. Ojoche Ameh                         |
| Hearing loss + cognitive decline (elderly)   | Dr. Iquo Archibong + Dr. Yetunde Akande                    |
| TB + malnutrition                            | Dr. Bassey Efiong + Dr. Ifeoma Onuoha                      |

---

*Specialty Map version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
