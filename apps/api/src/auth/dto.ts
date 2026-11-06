import { IsEmail, IsOptional, IsString, Length, Matches, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  @Length(20, 512)
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(20, 512)
  token!: string;

  @IsString()
  @MinLength(10)
  @Length(10, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: "password must contain upper, lower case letters and a number",
  })
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @Length(10, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: "password must contain upper, lower case letters and a number",
  })
  newPassword!: string;

  @IsString()
  @Length(10, 128)
  confirmPassword!: string;
}

export class VerifyEmailDto {
  @IsString()
  @Length(20, 512)
  token!: string;
}
