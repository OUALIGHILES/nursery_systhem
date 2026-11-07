/**
 * Shared password policy for password-reset and change-password flows.
 * Must stay in sync with backend `ResetPasswordDto` / `ChangePasswordDto`:
 * 10-128 chars, at least one lower, upper and digit (argon2id hashed server-side).
 */
export function policyError(value: string): string | null {
  if (value.length < 10) return "Your new password must be at least 10 characters.";
  if (value.length > 128) return "Your new password must be at most 128 characters.";
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
    return "Your new password must contain upper and lower case letters and a number.";
  }
  return null;
}

export function passwordsMatch(newPassword: string, confirmPassword: string): boolean {
  return newPassword === confirmPassword;
}
