# Validation Implementation Guide

## Overview
Comprehensive validation system for user and health professional registration with both frontend and backend-ready validation rules.

## Files Created/Modified

### 1. **utils/validation.ts** (NEW)
Complete validation utility with:
- Individual validation functions for each field
- Comprehensive `validateRegistration()` function that validates all fields based on role
- Helper functions: `getFieldError()`, `hasErrors()`
- Supports conditional validation for health professionals

**Key Features:**
- ✅ Name: min 2 characters
- ✅ Email: valid email format
- ✅ Password: min 8 chars, uppercase, lowercase, number
- ✅ Confirm Password: must match password
- ✅ Phone: valid phone format
- ✅ Date of Birth: valid date, cannot be in future
- ✅ Gender: must be male, female, or other
- ✅ Language & Health History: optional but must not be empty if provided
- ✅ **Health Professional Only:**
  - Specialization (required)
  - License Number (required)
  - Certificate Name (required)
  - Certificate ID (required)
  - Certificate Issue Date (required, valid date)
  - Years of Experience (required, 0-70)

### 2. **stores/auth-store.ts** (MODIFIED)
- Added import: `import { validateRegistration, hasErrors } from 'utils/validation';`
- Updated `register()` method to:
  - Call comprehensive validation before submitting
  - Display validation errors as Alert
  - Set error state with all validation messages
  - Only proceed to backend if all validations pass

### 3. **app/(auth)/(user)/review.tsx** (MODIFIED)
- Added validation import and error state management
- Pre-validation in `handleFinalSubmit()` before calling `register()`
- Display validation errors in red error box
- Show detailed summary of filled details
- Improved UI with ScrollView for better UX

### 4. **app/(auth)/(health-professional)/review.tsx** (MODIFIED)
- Added validation import and error state management
- Pre-validation in `handleFinalSubmit()` before calling `register()`
- Display validation errors in red error box
- Show comprehensive professional details summary
- Improved UI with ScrollView for better UX

## Validation Flow

```
User clicks "Submit Application"
    ↓
Pre-validation check (frontend)
    ↓
If errors found:
  - Display error alert
  - Show errors in red box
  - Return without submission
    ↓
If validation passes:
  - Call store's register() method
  - Store re-validates before API call
  - If store validation passes → Submit to backend
  - If store validation fails → Show alert
    ↓
Backend receives validated data
```

## Usage Example

```typescript
import { validateRegistration, hasErrors, getFieldError } from 'utils/validation';

// Validate entire form
const errors = validateRegistration(formData, 'user');

// Check if any errors
if (hasErrors(errors)) {
  // Display errors
}

// Get specific field error
const emailError = getFieldError(errors, 'email');
```

## Validation Rules by Role

### For Regular Users:
- Basic registration fields (name, email, password, phone, DOB, gender)
- Optional: language, health history

### For Health Professionals:
- All basic user fields PLUS:
- Specialization (required)
- License Number (required)
- Certificate Name (required)
- Certificate ID (required)
- Certificate Issue Date (required)
- Years of Experience (required, 0-70)

## Backend Integration

The validation rules are designed to match backend validation expectations. When sending to backend:

```typescript
{
  name: string (min 2 chars)
  email: string (valid email)
  password: string (min 8, uppercase, lowercase, number)
  phone: string (valid phone)
  dob: string (ISO8601 date, not in future)
  gender: 'male' | 'female' | 'other'
  language: string (optional)
  healthHistory: string (optional)
  role: 'user' | 'health_professional'
  // If role is 'health_professional':
  specialization: string
  licenseNumber: string
  certificateName: string
  certificateId: string
  certificateIssueDate: string (ISO8601 date)
  yearsOfExperience: number (0-70)
}
```

## Error Handling

Validation errors are displayed in two ways:
1. **Alert Dialog**: Shows all validation errors immediately
2. **Error Box**: Displays errors on review screen in red error container

This ensures users get immediate feedback and can correct issues before submission.

## Testing Validation

To test validation locally:

```typescript
// Test invalid name
validateRegistration({...draft, name: 'a'}, 'user')
// Expected: "Name must be at least 2 characters"

// Test weak password
validateRegistration({...draft, password: 'weak'}, 'user')
// Expected: Multiple password validation errors

// Test missing professional fields
validateRegistration({...draft, role: 'health_professional', specialization: ''}, 'health_professional')
// Expected: "Specialization is required for professionals"
```
