/**
 * Validation utility for registration form
 * Implements comprehensive validation rules for user and health professional registration
 */

import { UserDraft } from '../types/auth-types';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate name
 */
const validateName = (name: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!name || name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
    return errors;
  }

  if (name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
  }

  return errors;
};

/**
 * Validate email
 */
const validateEmail = (email: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!email || email.trim().length === 0) {
    errors.push({ field: 'email', message: 'Email is required' });
    return errors;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  return errors;
};

/**
 * Validate password
 */
const validatePassword = (password: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!password || password.length === 0) {
    errors.push({ field: 'password', message: 'Password is required' });
    return errors;
  }

  if (password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }

  if (!/[A-Z]/.test(password)) {
    errors.push({ field: 'password', message: 'Password must contain uppercase letter' });
  }

  if (!/[a-z]/.test(password)) {
    errors.push({ field: 'password', message: 'Password must contain lowercase letter' });
  }

  if (!/[0-9]/.test(password)) {
    errors.push({ field: 'password', message: 'Password must contain a number' });
  }

  return errors;
};

/**
 * Validate confirm password matches password
 */
const validateConfirmPassword = (confirm: string, password: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!confirm || confirm.length === 0) {
    errors.push({ field: 'confirm', message: 'Password confirmation is required' });
    return errors;
  }

  if (confirm !== password) {
    errors.push({ field: 'confirm', message: 'Passwords do not match' });
  }

  return errors;
};

/**
 * Validate phone number (basic format)
 */
const validatePhone = (phone: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!phone || phone.trim().length === 0) {
    errors.push({ field: 'phone', message: 'Phone is required' });
    return errors;
  }

  const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    errors.push({ field: 'phone', message: 'Invalid phone number' });
  }

  return errors;
};

/**
 * Validate date of birth
 */
const validateDob = (dob: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!dob || dob.trim().length === 0) {
    errors.push({ field: 'dob', message: 'Date of birth is required' });
    return errors;
  }

  // Check if it's a valid ISO8601 date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    errors.push({ field: 'dob', message: 'Date of birth must be a valid date' });
    return errors;
  }

  const date = new Date(dob);
  const now = new Date();

  if (isNaN(date.getTime())) {
    errors.push({ field: 'dob', message: 'Date of birth must be a valid date' });
    return errors;
  }

  if (date >= now) {
    errors.push({ field: 'dob', message: 'Date of birth cannot be in the future' });
  }

  return errors;
};

/**
 * Validate gender
 */
const validateGender = (gender: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!gender || gender.trim().length === 0) {
    errors.push({ field: 'gender', message: 'Gender is required' });
    return errors;
  }

  const validGenders = ['male', 'female', 'other'];
  if (!validGenders.includes(gender.toLowerCase())) {
    errors.push({
      field: 'gender',
      message: 'Gender must be male, female, or other',
    });
  }

  return errors;
};

/**
 * Validate language (optional)
 */
const validateLanguage = (language: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (language && language.trim().length === 0) {
    errors.push({ field: 'language', message: 'Language must not be empty if provided' });
  }

  return errors;
};

/**
 * Validate health history (optional)
 */
const validateHealthHistory = (healthHistory: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (healthHistory && healthHistory.trim().length === 0) {
    errors.push({
      field: 'healthHistory',
      message: 'Health history must not be empty if provided',
    });
  }

  return errors;
};

/**
 * Validate specialization (required for health professionals)
 */
const validateSpecialization = (specialization: string, isHealthProfessional: boolean): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (isHealthProfessional) {
    if (!specialization || specialization.trim().length === 0) {
      errors.push({ field: 'specialization', message: 'Specialization is required for professionals' });
    }
  }

  return errors;
};

/**
 * Validate license number (required for health professionals)
 */
const validateLicenseNumber = (licenseNumber: string, isHealthProfessional: boolean): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (isHealthProfessional) {
    if (!licenseNumber || licenseNumber.trim().length === 0) {
      errors.push({ field: 'licenseNumber', message: 'License number is required for professionals' });
    }
  }

  return errors;
};

/**
 * Validate certificate name (required for health professionals)
 */
const validateCertificateName = (certificateName: string, isHealthProfessional: boolean): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (isHealthProfessional) {
    if (!certificateName || certificateName.trim().length === 0) {
      errors.push({ field: 'certificateName', message: 'Certificate name is required for professionals' });
    }
  }

  return errors;
};

/**
 * Validate certificate ID (required for health professionals)
 */
const validateCertificateId = (certificateId: string, isHealthProfessional: boolean): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (isHealthProfessional) {
    if (!certificateId || certificateId.trim().length === 0) {
      errors.push({ field: 'certificateId', message: 'Certificate ID is required for professionals' });
    }
  }

  return errors;
};

/**
 * Validate certificate issue date (required for health professionals)
 */
const validateCertificateIssueDate = (certificateIssueDate: string, isHealthProfessional: boolean): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (isHealthProfessional) {
    if (!certificateIssueDate || certificateIssueDate.trim().length === 0) {
      errors.push({ field: 'certificateIssueDate', message: 'Certificate issue date is required for professionals' });
      return errors;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(certificateIssueDate)) {
      errors.push({ field: 'certificateIssueDate', message: 'Certificate issue date must be a valid date' });
    }
  }

  return errors;
};

/**
 * Validate years of experience (required for health professionals)
 */
const validateYearsOfExperience = (yearsOfExperience: string, isHealthProfessional: boolean): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (isHealthProfessional) {
    if (yearsOfExperience === '' || yearsOfExperience === undefined) {
      errors.push({ field: 'yearsOfExperience', message: 'Years of experience is required for professionals' });
      return errors;
    }

    const years = parseInt(yearsOfExperience, 10);

    if (isNaN(years)) {
      errors.push({ field: 'yearsOfExperience', message: 'Years of experience must be a number' });
    } else if (years < 0 || years > 70) {
      errors.push({ field: 'yearsOfExperience', message: 'Years of experience must be between 0 and 70' });
    }
  }

  return errors;
};

/**
 * Comprehensive validation for registration form
 * Returns array of validation errors, empty array if all valid
 */
export const validateRegistration = (
  formData: UserDraft,
  role: 'user' | 'professional'
): ValidationError[] => {
  const allErrors: ValidationError[] = [];
  const isHealthProfessional = role === 'professional';

  // Common fields
  allErrors.push(...validateName(formData.name));
  allErrors.push(...validateEmail(formData.email));
  allErrors.push(...validatePassword(formData.password));
  allErrors.push(...validateConfirmPassword(formData.confirmPassword, formData.password));
  allErrors.push(...validatePhone(formData.phone));
  allErrors.push(...validateDob(formData.dob));
  allErrors.push(...validateGender(formData.gender));
  allErrors.push(...validateLanguage(formData.language));
  allErrors.push(...validateHealthHistory(formData.healthHistory));

  // Health professional specific
  if (isHealthProfessional) {
    allErrors.push(...validateSpecialization(formData.specialization || '', isHealthProfessional));
    allErrors.push(...validateLicenseNumber(formData.licenseNumber || '', isHealthProfessional));
    allErrors.push(...validateCertificateName(formData.certificateName || '', isHealthProfessional));
    allErrors.push(...validateCertificateId(formData.certificateId || '', isHealthProfessional));
    allErrors.push(...validateCertificateIssueDate(formData.certificateIssueDate || '', isHealthProfessional));
    allErrors.push(...validateYearsOfExperience(formData.yearsOfExperience || '', isHealthProfessional));
  }

  return allErrors;
};

/**
 * Get first error message for a field
 */
export const getFieldError = (errors: ValidationError[], field: string): string | null => {
  const error = errors.find((err) => err.field === field);
  return error ? error.message : null;
};

/**
 * Check if there are any errors
 */
export const hasErrors = (errors: ValidationError[]): boolean => {
  return errors.length > 0;
};

/**
 * Validate a single field in real-time
 * Returns error message or null if valid
 */
export const validateSingleField = (
  fieldName: string,
  value: string,
  isHealthProfessional: boolean = false,
  additionalData?: { password?: string }
): string | null => {
  let errors: ValidationError[] = [];

  switch (fieldName) {
    case 'name':
      errors = validateName(value);
      break;
    case 'email':
      errors = validateEmail(value);
      break;
    case 'password':
      errors = validatePassword(value);
      break;
    case 'confirm':
    case 'confirmPassword':
      errors = validateConfirmPassword(value, additionalData?.password || '');
      break;
    case 'phone':
      errors = validatePhone(value);
      break;
    case 'dob':
      errors = validateDob(value);
      break;
    case 'gender':
      errors = validateGender(value);
      break;
    case 'language':
      errors = validateLanguage(value);
      break;
    case 'healthHistory':
      errors = validateHealthHistory(value);
      break;
    case 'specialization':
      errors = validateSpecialization(value, isHealthProfessional);
      break;
    case 'licenseNumber':
      errors = validateLicenseNumber(value, isHealthProfessional);
      break;
    case 'certificateName':
      errors = validateCertificateName(value, isHealthProfessional);
      break;
    case 'certificateId':
      errors = validateCertificateId(value, isHealthProfessional);
      break;
    case 'certificateIssueDate':
      errors = validateCertificateIssueDate(value, isHealthProfessional);
      break;
    case 'yearsOfExperience':
      errors = validateYearsOfExperience(value, isHealthProfessional);
      break;
    default:
      break;
  }

  return getFieldError(errors, fieldName);
};
