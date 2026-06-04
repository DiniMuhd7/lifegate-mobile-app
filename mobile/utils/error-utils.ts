export const extractErrorMessage = (error: any): string => {
  // Helper function to convert any value to string
  const toString = (value: any): string => {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object' && value !== null) {
      // If object has a message field, extract it
      if (value.message && typeof value.message === 'string') {
        return value.message;
      }
      // Try to stringify the object
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value || '');
  };

  // Axios response errors - extract message string
  if (error.response?.data?.message) {
    return toString(error.response.data.message);
  }

  if (error.response?.data?.error) {
    return toString(error.response.data.error);
  }

  if (error.response?.data?.details) {
    return toString(error.response.data.details);
  }

  // For validation errors - combine field errors
  if (error.response?.data?.errors && typeof error.response.data.errors === 'object') {
    const errors = error.response.data.errors;
    const messages = Object.values(errors).flat().join(', ');
    return messages || 'Validation failed';
  }

  // Network errors
  if (error.code === 'ECONNABORTED') {
    return 'Connection timed out. The server may be waking up — please try again in a moment.';
  }
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return 'Cannot connect to server. Please try again.';
  }
  if (error.message === 'Network Error') {
    return 'Network error. Please check your connection.';
  }

  // Direct error message
  if (typeof error === 'string') {
    return error;
  }
  
  return toString(error?.message) || 'An error occurred. Please try again.';
};