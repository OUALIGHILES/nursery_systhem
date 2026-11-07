import { describe, expect, it } from "vitest";
import { displayBody, displayTitle, isUnread, safeLink } from "./lib";

describe("details and read behavior (P7.R9)", () => {
  it("renders real title/body verbatim", () => {
    const n = { id: "1", type: "ENROLLMENT", title: "Enrollment approved", body: "Your application LS-1 approved", createdAt: new Date().toISOString() };
    expect(displayTitle(n as never)).toBe("Enrollment approved");
    expect(displayBody(n as never)).toBe("Your application LS-1 approved");
  });

  it("uses contextual fallback only when body missing", () => {
    const n = { id: "1", type: "CHECK_IN", title: "Checked in", body: "", createdAt: new Date().toISOString() };
    const fb = displayBody(n as never);
    expect(fb).toContain("checked in");
    expect(fb).not.toBe("You have a new notification.");
  });

  it("read helper is based on readAt", () => {
    expect(isUnread({ id: "1", type: "GENERAL", title: "t", body: "b", readAt: null, createdAt: new Date().toISOString() } as never)).toBe(true);
    expect(isUnread({ id: "1", type: "GENERAL", title: "t", body: "b", readAt: new Date().toISOString(), createdAt: new Date().toISOString() } as never)).toBe(false);
  });

  it("blocks cross-portal navigation", () => {
    expect(safeLink("/admin/admissions", "parent")).toBe("/parent/notifications");
    expect(safeLink("/parent/invoices", "admin")).toBe("/admin/notifications");
    expect(safeLink("/parent/invoices", "parent")).toBe("/parent/invoices");
    expect(safeLink("/admin/admissions", "admin")).toBe("/admin/admissions");
    expect(safeLink("https://evil.test", "parent")).toBe("/parent/notifications");
  });
});
