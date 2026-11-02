const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegistrationValues {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  tenantName: string;
}

export function validateLogin(email: string, password: string): string | null {
  if (!email.trim() || !password) return "Enter your email and password.";
  if (!EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length > 128) {
    return "Password must not exceed 128 characters.";
  }

  const missing: string[] = [];
  if (password.length < 8) missing.push("at least 8 characters");
  if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (!/[^A-Za-z0-9\s]/.test(password)) missing.push("a special character");

  if (missing.length === 3) {
    return "Password must be at least 8 characters and contain an uppercase letter and a special character.";
  }
  if (missing.length === 2) {
    return `Password must contain ${missing[0]} and ${missing[1]}.`;
  }
  if (missing.length === 1) {
    if (missing[0] === "at least 8 characters") {
      return "Password must be at least 8 characters long.";
    }
    return `Password must contain ${missing[0]}.`;
  }
  return null;
}

export function validateRegistration(values: RegistrationValues): string | null {
  if (!values.email.trim() || !values.password || !values.firstName.trim() || !values.tenantName.trim()) {
    return "Complete all required fields to continue.";
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) return "Enter a valid email address.";

  const passwordError = validatePassword(values.password);
  if (passwordError) return passwordError;

  if (values.confirmPassword !== values.password) return "Your passwords do not match.";
  if (values.firstName.trim().length > 100 || values.lastName.trim().length > 100) {
    return "Names must be 100 characters or fewer.";
  }
  if (values.tenantName.trim().length < 2 || values.tenantName.trim().length > 150) {
    return "Workspace name must be between 2 and 150 characters.";
  }
  return null;
}
