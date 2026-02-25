// What the backend returns after login

export type UserDraft = {
  name: string; // registration only
  email: string;
  password: string;
  confirm: string; // registration only
  phone: string; // profile details (step 2 of registration)
  role?: string; // user role (user or health professional)
  dob: string;
  gender: string;
  language: string;
  healthHistory: string; // profile details (step 2 of registration)
};


export type HealthProfessionalDraft = {
  name: string; // registration only
  email: string;
  password: string;
  confirm: string; // registration only
  phone: string; // profile details (step 2 of registration)
  role?: string; // user role (user or health professional)
  dob: string;
  gender: string;
  language: string;
  healthHistory: string; // profile details (step 2 of registration)
  specialization?: string; // health professional only
  licenseNumber: string;
  certificateName: string;
  certificateId: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
};


export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  language: string;
  healthHistory: string;
};

export type HealthProfessionalUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  language: string;
  healthHistory: string;
  specialization?: string;
  licenseNumber: string;
  certificateName: string;
  certificateId: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
  role?: string;
}

// Data sent to backend
export type LoginPayload = {
  email: string;
  password: string;
};

export type HealthProfessionalLoginPayload = {
  email: string;
  password: string;
};

// Standard API response
export type LoginResponse = {
  success: boolean;
  user?: AuthUser;
  message?: string;
};

export type HealthProfessionalLoginResponse = {
  success: boolean;
  user?: HealthProfessionalUser;
  message?: string;
};
