import { SetMetadata } from "@nestjs/common";

export const PASSWORD_CHANGE_ALLOWED_KEY = "passwordChangeAllowed";

/**
 * Allows authenticated users with mustChangePassword=true to call the
 * decorated endpoint. JwtAuthGuard rejects all other authenticated routes
 * for those users with 403 PASSWORD_CHANGE_REQUIRED.
 */
export const PasswordChangeAllowed = () => SetMetadata(PASSWORD_CHANGE_ALLOWED_KEY, true);
