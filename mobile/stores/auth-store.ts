/**
 * BACKWARD COMPATIBILITY RE-EXPORT
 *
 * This file re-exports all auth-related stores as a convenience.
 * The actual implementations have been moved to stores/auth/*.ts
 *
 * This wrapper allows existing imports to continue working:
 *   import { useAuthStore } from 'stores/auth-store'
 *
 * New code should import from the specific stores:
 *   import { useAuthStore } from 'stores/auth/auth-store'
 *   import { useRegistrationStore } from 'stores/auth/registration-store'
 *   import { usePasswordRecoveryStore } from 'stores/auth/password-recovery-store'
 *   import { useProfileStore } from 'stores/auth/profile-store'
 */

export { useAuthStore } from './auth/auth-store';
export { useRegistrationStore } from './auth/registration-store';
export { usePasswordRecoveryStore } from './auth/password-recovery-store';
export { useProfileStore } from './auth/profile-store';
