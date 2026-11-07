import { describe, expect, it } from "vitest";
import { buildQuery } from "./useNotifications";
import { safeAdminLink, upsertNotification, isInboxNotification, isNewUnread } from "./lib";

describe("admin notifications (P7.R7)", () => {
  it("builds query with status, type and q", () => {
    const qs = buildQuery({ status: "unread", type: "ENROLLMENT", q: "lunch", page: 2, pageSize: 20 });
    const p = new URLSearchParams(qs);
    expect(p.get("status")).toBe("unread");
    expect(p.get("type")).toBe("ENROLLMENT");
    expect(p.get("q")).toBe("lunch");
    expect(p.get("page")).toBe("2");
  });

  it("rejects chat payload without notification id", () => {
    expect(isInboxNotification({ conversationId: "c1", messageId: "m1" })).toBe(false);
    expect(isInboxNotification({ notification: { id: "n1" } })).toBe(true);
    expect(isInboxNotification(null)).toBe(false);
  });

  it("deduplicates socket notifications by id", () => {
    const cur = [{ id: "n1", type: "GENERAL", title: "a", body: "b", createdAt: new Date().toISOString() }];
    const next = upsertNotification(cur as never, { notification: { id: "n1", type: "GENERAL", title: "a", body: "b", createdAt: new Date().toISOString() } } as never);
    expect(next).toHaveLength(1);
    const added = upsertNotification(cur as never, { notification: { id: "n2", type: "GENERAL", title: "x", body: "y", createdAt: new Date().toISOString() } } as never);
    expect(added).toHaveLength(2);
  });

  it("keeps admin links and remaps parent links", () => {
    expect(safeAdminLink("/admin/admissions")).toBe("/admin/admissions");
    expect(safeAdminLink("/parent/applications")).toBe("/admin/notifications");
    expect(safeAdminLink(null)).toBe("/admin/notifications");
  });

  it("does not count duplicate notification", () => {
    const seen = new Set(["n1"]);
    expect(isNewUnread({ notification: { id: "n1", type: "GENERAL" } }, seen)).toBe(false);
  });

  it("counts genuinely new unread notification", () => {
    const seen = new Set<string>();
    expect(isNewUnread({ notification: { id: "n2", type: "GENERAL", readAt: null } }, seen)).toBe(true);
  });

  it("does not count already-read notification", () => {
    const seen = new Set<string>();
    expect(isNewUnread({ notification: { id: "n3", type: "GENERAL", readAt: new Date().toISOString() } }, seen)).toBe(false);
  });

  it("repeated delivery stays deduplicated", () => {
    const seen = new Set<string>();
    expect(isNewUnread({ notification: { id: "n4", type: "GENERAL", readAt: null } }, seen)).toBe(true);
    seen.add("n4");
    expect(isNewUnread({ notification: { id: "n4", type: "GENERAL", readAt: null } }, seen)).toBe(false);
  });
});
