// What the backend returns after login
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

// Data sent to backend
export type LoginPayload = {
  email: string;
  password: string;
};

// Standard API response
export type LoginResponse = {
  success: boolean;
  user?: AuthUser;
  message?: string;
};
