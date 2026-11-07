import { describe, expect, it } from "vitest";
import { pickupErrorMessage } from "./child-profile";

describe("child management helpers", () => {
  it("maps 403/404 for edit/assign/link errors", () => {
    expect(pickupErrorMessage("403 Forbidden")).toContain("permission to modify");
    expect(pickupErrorMessage("404 Child not found")).toContain("not found");
  });

  it("preserves capacity message", () => {
    expect(pickupErrorMessage('Classroom "Sun" is at capacity (20)')).toContain("at capacity");
  });

  it("preserves duplicate message", () => {
    expect(pickupErrorMessage("Parent already linked to this child")).toContain("already linked");
  });
});
