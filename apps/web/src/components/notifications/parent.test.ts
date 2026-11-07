import { describe, expect, it } from "vitest";
import { safeParentLink, safeAdminLink, categoriesFor, isNewUnread } from "./lib";
import { buildQuery } from "./useNotifications";

describe("parent notifications (P7.R8)", () => {
  it("keeps parent links and remaps admin links", () => {
    expect(safeParentLink("/parent/attendance")).toBe("/parent/attendance");
    expect(safeParentLink("/admin/admissions")).toBe("/parent/notifications");
    expect(safeParentLink(null)).toBe("/parent/notifications");
    expect(safeAdminLink("/parent/applications")).toBe("/admin/notifications");
  });

  it("uses parent categories including CHECK_OUT/ABSENCE/PAYMENT", () => {
    const vals = categoriesFor("parent").map((c) => c.value);
    expect(vals).toContain("CHECK_OUT");
    expect(vals).toContain("ABSENCE");
    expect(vals).toContain("PAYMENT");
    expect(vals).not.toContain("ACTIVITY");
  });

  it("builds parent inbox query with q", () => {
    const qs = buildQuery({ status: "all", type: "CHECK_IN", q: "present", page: 1, pageSize: 20 });
    const p = new URLSearchParams(qs);
    expect(p.get("type")).toBe("CHECK_IN");
    expect(p.get("q")).toBe("present");
  });

  it("deduplicates parent socket notifications", () => {
    const seen = new Set(["n1"]);
    expect(isNewUnread({ notification: { id: "n1", type: "CHECK_IN", readAt: null } }, seen)).toBe(false);
    expect(isNewUnread({ notification: { id: "n2", type: "CHECK_IN", readAt: null } }, seen)).toBe(true);
    expect(isNewUnread({ conversationId: "c1", messageId: "m1" } as unknown, seen)).toBe(false);
  });
});
