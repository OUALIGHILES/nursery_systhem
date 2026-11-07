import { describe, expect, it } from "vitest";
import { pickupErrorMessage } from "./child-profile";

describe("pickupErrorMessage", () => {
  it("maps 403 to permission message", () => {
    expect(pickupErrorMessage("403 Forbidden: You do not have access to this child")).toContain("permission");
  });

  it("maps 404 to not-found message", () => {
    expect(pickupErrorMessage("404 Child not found")).toBe("Child or pickup not found.");
  });

  it("passes through validation errors", () => {
    expect(pickupErrorMessage("fullName must be longer than or equal to 2 characters")).toContain("fullName");
  });

  it("handles network errors via generic path", () => {
    expect(pickupErrorMessage("Failed to fetch")).toBe("Failed to fetch");
  });
});
