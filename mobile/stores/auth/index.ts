/**
 * Barrel exports for auth stores
 * Allows flexible import patterns:
 *   - import { useAuthStore } from 'stores/auth'
 *   - import { useRegistrationStore } from 'stores/auth'
 *   - import { usePasswordRecoveryStore } from 'stores/auth'
 *   - import { useProfileStore } from 'stores/auth'
 */

export { useAuthStore } from './auth-store';
export { useRegistrationStore } from './registration-store';
export { usePasswordRecoveryStore } from './password-recovery-store';
export { useProfileStore } from './profile-store';
