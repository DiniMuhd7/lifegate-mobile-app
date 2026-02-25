import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoginPayload, LoginResponse, HealthProfessionalLoginPayload, HealthProfessionalLoginResponse } from 'types/auth-types';

// Storage keys
const USER_STORAGE_KEY = '@lifegate_user';
const USER_ROLE_STORAGE_KEY = '@lifegate_user_role';
const HEALTH_PROFESSIONAL_STORAGE_KEY = '@lifegate_health_professional';

// pretend "database" for regular users
const USERS_DB = [
  {
    id: '1',
    name: 'Test User',
    email: 'admin@lifegate.com',
    password: '123456',
    phone: '123-456-7890',
    dob: '1990-01-01',
    gender: 'Male',
    language: 'English',
    healthHistory: 'None',
  },
];



// pretend "database" for health professionals
const HEALTH_PROFESSIONALS_DB = [
  {
    id: 'hp-1',
    name: 'Dr. John Smith',
    email: 'doctor@lifegate.com',
    password: '123456',
    phone: '123-456-7891',
    dob: '1985-05-15',
    gender: 'Male',
    language: 'English',
    healthHistory: 'None',
    specialization: 'Cardiology',
    licenseNumber: 'LIC-12345',
    certificateName: 'MD',
    certificateId: 'CERT-12345',
    certificateIssueDate: '2015-06-01',
    yearsOfExperience: '10',
  },
];

export const AuthService = {
  // Utility function to save user to async storage
  async saveUserToStorage(user: any, userRole: 'user' | 'health_professional') {
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      await AsyncStorage.setItem(USER_ROLE_STORAGE_KEY, userRole);
      console.log(`${userRole} saved to async storage`);
    } catch (error) {
      console.error('Failed to save user to async storage:', error);
    }
  },

  // Utility function to clear user from async storage
  async clearUserFromStorage() {
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_ROLE_STORAGE_KEY);
      await AsyncStorage.removeItem(HEALTH_PROFESSIONAL_STORAGE_KEY);
      console.log('User cleared from async storage');
    } catch (error) {
      console.error('Failed to clear user from async storage:', error);
    }
  },

  // Utility function to get stored user
  async getStoredUser() {
    try {
      const user = await AsyncStorage.getItem(USER_STORAGE_KEY);
      const userRole = await AsyncStorage.getItem(USER_ROLE_STORAGE_KEY);
      
      if (user && userRole) {
        return {
          user: JSON.parse(user),
          userRole: userRole as 'user' | 'health_professional',
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get stored user:', error);
      return null;
    }
  },

  // ---------------- LOGIN ----------------
  async login(payload: LoginPayload): Promise<LoginResponse> {
    console.log('Sending login request to server...');

    await new Promise((res) => setTimeout(res, 1200));

    const user = USERS_DB.find((u) => u.email === payload.email && u.password === payload.password);

    if (user) {
      console.log('Login successful (server validated credentials)');

      const responseUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        dob: user.dob,
        gender: user.gender,
        language: user.language,
        healthHistory: user.healthHistory,
      };

      // Save to async storage
      await this.saveUserToStorage(responseUser, 'user');

      return {
        success: true,
        user: responseUser,
      };
    } else {
      console.log('Login failed: Invalid email or password');
      return { success: false, message: 'Invalid email or password' };
    }
  },

  // ---------------- REGISTER ----------------
  async register(payload: {
    name: string;
    email: string;
    password: string;
    phone: string;
    dob: string;
    gender: string;
    language: string;
    healthHistory: string;
  }): Promise<LoginResponse> {
    console.log('Sending registration request to server...');

    await new Promise((res) => setTimeout(res, 1500));

    // check if email already exists
    const existingUser = USERS_DB.find((u) => u.email === payload.email);
    if (existingUser) {
      return { success: false, message: 'Email already in use' };
    }

    // create new user
    const newUser = {
      id: (USERS_DB.length + 1).toString(), // simple auto-increment id
      name: payload.name,
      email: payload.email,
      password: payload.password,
      phone: payload.phone,
      dob: payload.dob,
      gender: payload.gender,
      language: payload.language,
      healthHistory: payload.healthHistory,
    };

    USERS_DB.push(newUser);

    console.log('Registration successful');

    const responseUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      dob: newUser.dob,
      gender: newUser.gender,
      language: newUser.language,
      healthHistory: newUser.healthHistory,
    };

    // Save to async storage
    await this.saveUserToStorage(responseUser, 'user');

    return {
      success: true,
      user: responseUser,
    };
  },

  // ============ HEALTH PROFESSIONAL LOGIN ============
  async healthProfessionalLogin(payload: HealthProfessionalLoginPayload): Promise<HealthProfessionalLoginResponse> {
    console.log('Sending health professional login request to server...');

    await new Promise((res) => setTimeout(res, 1200));

    const healthProfessional = HEALTH_PROFESSIONALS_DB.find(
      (hp) => hp.email === payload.email && hp.password === payload.password
    );

    if (healthProfessional) {
      console.log('Health professional login successful (server validated credentials)');

      const responseUser = {
        id: healthProfessional.id,
        name: healthProfessional.name,
        email: healthProfessional.email,
        phone: healthProfessional.phone,
        dob: healthProfessional.dob,
        gender: healthProfessional.gender,
        language: healthProfessional.language,
        healthHistory: healthProfessional.healthHistory,
        specialization: healthProfessional.specialization,
        licenseNumber: healthProfessional.licenseNumber,
        certificateName: healthProfessional.certificateName,
        certificateId: healthProfessional.certificateId,
        certificateIssueDate: healthProfessional.certificateIssueDate,
        yearsOfExperience: healthProfessional.yearsOfExperience,
      };

      // Save to async storage
      await this.saveUserToStorage(responseUser, 'health_professional');

      return {
        success: true,
        user: responseUser,
      };
    } else {
      console.log('Health professional login failed: Invalid email or password');
      return { success: false, message: 'Invalid email or password' };
    }
  },

  // ============ HEALTH PROFESSIONAL REGISTER ============
  async healthProfessionalRegister(payload: {
    name: string;
    email: string;
    password: string;
    phone: string;
    dob: string;
    gender: string;
    language: string;
    healthHistory: string;
    specialization: string;
    licenseNumber: string;
    certificateName: string;
    certificateId: string;
    certificateIssueDate?: string;
    yearsOfExperience?: string;
  }): Promise<HealthProfessionalLoginResponse> {
    console.log('Sending health professional registration request to server...');

    await new Promise((res) => setTimeout(res, 1500));

    // check if email already exists
    const existingHealthProfessional = HEALTH_PROFESSIONALS_DB.find((hp) => hp.email === payload.email);
    if (existingHealthProfessional) {
      console.log('Registration failed: Email already in use');
      return { success: false, message: 'Email already in use' };
    }

    // create new health professional
    const newHealthProfessional = {
      id: `hp-${HEALTH_PROFESSIONALS_DB.length + 1}`,
      name: payload.name,
      email: payload.email,
      password: payload.password,
      phone: payload.phone,
      dob: payload.dob,
      gender: payload.gender,
      language: payload.language,
      healthHistory: payload.healthHistory,
      specialization: payload.specialization,
      licenseNumber: payload.licenseNumber,
      certificateName: payload.certificateName,
      certificateId: payload.certificateId,
      certificateIssueDate: payload.certificateIssueDate,
      yearsOfExperience: payload.yearsOfExperience,
    };

    HEALTH_PROFESSIONALS_DB.push(newHealthProfessional);

    console.log('Health professional registration successful');

    const responseUser = {
      id: newHealthProfessional.id,
      name: newHealthProfessional.name,
      email: newHealthProfessional.email,
      phone: newHealthProfessional.phone,
      dob: newHealthProfessional.dob,
      gender: newHealthProfessional.gender,
      language: newHealthProfessional.language,
      healthHistory: newHealthProfessional.healthHistory,
      specialization: newHealthProfessional.specialization,
      licenseNumber: newHealthProfessional.licenseNumber,
      certificateName: newHealthProfessional.certificateName,
      certificateId: newHealthProfessional.certificateId,
      certificateIssueDate: newHealthProfessional.certificateIssueDate,
      yearsOfExperience: newHealthProfessional.yearsOfExperience,
    };

    // Save to async storage
    await this.saveUserToStorage(responseUser, 'health_professional');

    return {
      success: true,
      user: responseUser,
    };
  },
};