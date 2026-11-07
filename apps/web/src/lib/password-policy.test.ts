import { describe, expect, it } from "vitest";
import { passwordsMatch, policyError } from "./password-policy";

describe("password-policy (reset-password frontend)", () => {
  it("accepts a valid password (10-128, upper/lower/digit)", () => {
    expect(policyError("NewPass123")).toBeNull();
  });

  it("rejects too short passwords", () => {
    expect(policyError("Short1")).toBe("Your new password must be at least 10 characters.");
  });

  it("rejects missing character classes", () => {
    expect(policyError("lowercase123")).toContain("upper and lower");
    expect(policyError("UPPERCASE123")).toContain("upper and lower");
    expect(policyError("NoNumbersHere")).toContain("upper and lower");
  });

  it("rejects too long passwords", () => {
    expect(policyError("A1" + "a".repeat(127))).toBe("Your new password must be at most 128 characters.");
  });

  it("detects confirmation mismatch", () => {
    expect(passwordsMatch("NewPass123", "NewPass123")).toBe(true);
    expect(passwordsMatch("NewPass123", "Different123")).toBe(false);
  });
});
