export const USER_TYPE_OPTIONS = [
  { label: 'Normal User', value: 'normal' },
  { label: 'Healthcare Professional', value: 'healthcare' },
];

export const GENDER_OPTIONS = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
];

export const FREE_HEALTH_SCREENING_OPTIONS = [
  { label: 'Subsidized Genotype Test', value: 'subsidized_genotype_test' },
  { label: 'Vital Signs Check', value: 'vital_signs_check' },
  { label: 'BMI Assessment', value: 'bmi_assessment' },
  { label: 'Blood Group Test', value: 'blood_group_test' },
  { label: 'Packed Cell Volume', value: 'packed_cell_volume' },
  { label: 'Malaria Test', value: 'malaria_test' },
  { label: 'Hepatitis Screening', value: 'hepatitis_screening' },
  { label: 'HIV Screening', value: 'hiv_screening' },
  { label: 'Other basic health screening', value: 'other_basic' },
];

export const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Hausa', value: 'Hausa' },
  { label: 'Yoruba', value: 'Yoruba' },
  { label: 'Igbo', value: 'Igbo' },
];

export const CERTIFICATE_TYPE_OPTIONS = [
  { label: 'General', value: 'General' },
  { label: 'Specialist', value: 'Specialist' }

];

export const STEP_TITLES: Record<number, string> = {
  1: 'Get Started Today',
  2: 'Complete Profile Setup',
  3: 'Add Certification',
  4: 'Review & Submit',
};

export const issues = [
            { label: 'Consultation Issues', value: 'Consultation Issues' },
            { label: 'Subscription Issue', value: 'Subscription Issues' },
            { label: 'Others', value: 'Others' },
          ]


/**
 * UI Font Sizes - Modifiable for consistent sizing across chat screen
 */
export const UI_FONT_SIZES = {
  MESSAGE_TEXT: 14, // Message bubble text size
  MESSAGE_TIMESTAMP: 11, // Timestamp text size
  MESSAGE_STATUS: 12, // Status indicator text size
  INPUT_TEXT: 14, // Chat input text size
  TYPING_INDICATOR: 14, // "LifeGate is typing" text size
};

/**
 * UI Spacing - Modifiable spacing constants
 */
export const UI_SPACING = {
  SCREEN_PADDING_HORIZONTAL: 'px-4',
  SCREEN_PADDING_BOTTOM: 'pb-6',
  MESSAGE_MARGIN_BOTTOM: 'mb-2',
  MESSAGE_HORIZONTAL_PADDING: 'px-4',
  MESSAGE_LIST_PADDING_VERTICAL: 'py-4',
};
