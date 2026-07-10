// Centralized User Type - Single user with role-based data
export type User = {
  // Primary identifiers
  id: string;
  user_id: string;
  patient_id: string;
  
  // Basic info
  name: string;
  email: string;
  role: 'user' | 'professional' | 'admin';
  
  // Contact & Demographics
  phone?: string;
  dob?: string;
  gender?: string;
  language?: string;
  country?: string | null;
  state?: string | null;
  
  // Health information
  health_history?: string;
  referral_code?: string;
  blood_type?: string | null;
  genotype?: string | null;
  allergies?: string | null;
  medical_history?: string | null;
  current_medications?: string | null;
  emergency_contact?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Health professional specific fields
  specialization?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
  // MDCN license verification
  mdcn_verified?: boolean;
  mdcn_verified_at?: string | null;
  // Account deletion scheduling
  deletion_scheduled_at?: string | null;
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
  state?: string;
  country?: string;
  referredByCode?: string;
  /** Comma-separated list of selected free health screening option values */
  freeHealthScreening?: string;
  role?: 'user' | 'professional'; // Set based on registration choice
  // Health professional specific fields
  specialization?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
  // File upload for professionals
  certificate?: any | null;
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
  state?: string;
  country?: string;
  referredByCode?: string;
  role: 'user' | 'professional' | 'admin';
  // Health professional specific fields (optional)
  specialization?: string;
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
    token?: string;
    refresh_token?: string;
    user?: User;
    // Set when physician login requires a second factor
    requires2FA?: boolean;
    email?: string;
  };
};

// Auth response for client
export type AuthResponse = {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  message?: string;
  // Set when the backend requires physician 2FA before issuing a JWT
  requires2FA?: boolean;
  email?: string;
};

// Physician 2FA verification response (same shape as a normal login response)
export type Physician2FAResponse = AuthResponse;

// Registration start request payload - can be FormData or object
// Note: When certificate file is present, this must be sent as FormData
export type RegistrationStartPayload = {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'professional' | 'admin';
  phone: string;
  dob: string;
  gender: string;
  language: string;
  healthHistory?: string;
  referredByCode?: string;
  // Professional fields
  specialization?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
  // File upload for professionals - included when building FormData
  certificate?: File;
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

// Password reset - send reset code payload
export type SendResetCodePayload = {
  email: string;
};

// Password reset - send reset code response
export type SendResetCodeResponse = {
  success: boolean;
  message: string;
};

// Password reset - verify reset code payload
export type VerifyResetCodePayload = {
  email: string;
  code: string;
};

// Password reset - verify reset code response (contains resetToken)
export type VerifyResetCodeResponse = {
  success: boolean;
  message: string;
  data: {
    resetToken: string;
  };
};

// Password reset - reset password payload
export type ResetPasswordPayload = {
  token: string;
  newPassword: string;
};

// Password reset - reset password response
export type ResetPasswordResponse = {
  success: boolean;
  message: string;
  data?: {
    message: string;
  };
};
