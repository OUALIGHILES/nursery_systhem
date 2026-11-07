import { describe, expect, it } from "vitest";
import { isAdminEvent, mapCategory, composeAdminBody } from "./category-mapper.js";
import { parentRecipientIds } from "./recipient-policy.js";

describe("category-mapper (P7.R6)", () => {
  it("marks admin-only topics", () => {
    expect(isAdminEvent("enrollment.submitted")).toBe(true);
    expect(isAdminEvent("child.enrolled")).toBe(true);
    expect(isAdminEvent("activity.created")).toBe(true);
    expect(isAdminEvent("meal.recorded")).toBe(true);
    expect(isAdminEvent("attendance.checked_in")).toBe(false);
  });

  it("maps meal.recorded to admin link without medical leak", () => {
    const m = mapCategory("meal.recorded", { id: "r1", mealType: "LUNCH" });
    expect(m.link).toBe("/admin/meals");
    const body = composeAdminBody("meal.recorded", { id: "r1", mealType: "LUNCH", childId: "c1" });
    expect(body).not.toContain("note");
  });

  it("maps enrollment submitted to admin admissions", () => {
    const m = mapCategory("enrollment.submitted", { reference: "LS-1" });
    expect(m.type).toBe("ENROLLMENT");
    expect(m.link).toBe("/admin/admissions");
  });

  it("parent recipients never fall back to admins", () => {
    expect(parentRecipientIds({ parentUserIds: ["u1"] })).toEqual(["u1"]);
    expect(parentRecipientIds({})).toEqual([]);
  });
});
