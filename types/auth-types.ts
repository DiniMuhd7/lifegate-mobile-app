// Centralized User Type - Single user with role-based data
export type User = {
  // Primary identifiers
  id: string;
  user_id: string;
  patient_id: string;
  
  // Basic info
  name: string;
  email: string;
  role: 'user' | 'professional';
  
  // Contact & Demographics
  phone?: string;
  dob?: string;
  gender?: string;
  language?: string;
  
  // Health information
  health_history?: string;
  blood_type?: string | null;
  allergies?: string | null;
  medical_history?: string | null;
  current_medications?: string | null;
  emergency_contact?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Health professional specific fields
  specialization?: string;
  licenseNumber?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
};

// Form draft for registration - contains all possible fields
export type UserDraft = {
  // Required fields
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  // Common profile fields
  phone: string;
  dob: string;
  gender: string;
  language: string;
  healthHistory: string;
  role?: 'user' | 'professional'; // Set based on registration choice
  // Health professional specific fields
  specialization?: string;
  licenseNumber?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
};

// Login payload
export type LoginPayload = {
  email: string;
  password: string;
};

// Registration payload - contains all fields for both user and health professional
export type RegisterPayload = {
  // Required fields
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  // Common profile fields
  phone: string;
  dob: string;
  gender: string;
  language: string;
  healthHistory: string;
  role: 'user' | 'professional';
  // Health professional specific fields (optional)
  specialization?: string;
  licenseNumber?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
};

// Standard API response - Backend format with token
export type BackendLoginResponse = {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: User;
  };
};

// Auth response for client
export type AuthResponse = {
  success: boolean;
  user?: User;
  message?: string;
};

// Registration start request payload
export type RegistrationStartPayload = {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'professional';
  phone: string;
  dob: string;
  gender: string;
  language: string;
  healthHistory?: string;
  // Professional fields
  specialization?: string;
  licenseNumber?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
};

// Registration start response from backend
export type RegistrationStartResponse = {
  success: boolean;
  message: string;
  data?: {
    email: string;
    otpExpiresIn: number; // in seconds
  };
};

// Registration verification request payload
export type RegistrationVerifyPayload = {
  email: string;
  otp: string;
};

// Registration verification response from backend (contains JWT and user)
export type RegistrationVerifyResponse = {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: User;
  };
};

// Registration resend OTP response
export type RegistrationResendResponse = {
  success: boolean;
  message: string;
  data?: {
    email: string;
    otpExpiresIn: number;
  };
};
