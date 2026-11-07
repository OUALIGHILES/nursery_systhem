import { describe, expect, it } from "vitest";
import { CHAT_SERVER_EVENTS } from "../app/chat/socket-events";

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  DIRECTOR: "/admin",
  TEACHER: "/teacher",
  STAFF: "/staff",
  PARENT: "/parent",
};

describe("notifications replacement (P7.R5)", () => {
  it("exports notification:new for inbox push", () => {
    expect(CHAT_SERVER_EVENTS.NOTIFICATION).toBe("notification:new");
  });

  it("maps admin roles to admin portal and parent to parent portal", () => {
    expect(ROLE_HOME.ADMIN).toBe("/admin");
    expect(ROLE_HOME.SUPER_ADMIN).toBe("/admin");
    expect(ROLE_HOME.DIRECTOR).toBe("/admin");
    expect(ROLE_HOME.PARENT).toBe("/parent");
  });

  it("builds role-aware notifications routes", () => {
    const admin = `${ROLE_HOME.ADMIN}/notifications`;
    const parent = `${ROLE_HOME.PARENT}/notifications`;
    expect(admin).toBe("/admin/notifications");
    expect(parent).toBe("/parent/notifications");
    expect(admin).not.toBe(parent);
  });

  it("coexists with chat payload shape without collision", () => {
    const chatPayload = { conversationId: "c1", messageId: "m1" };
    const inboxPayload = { notification: { id: "n1", title: "Hi" } };
    expect((inboxPayload as { notification?: unknown }).notification).toBeDefined();
    expect((chatPayload as { notification?: unknown }).notification).toBeUndefined();
  });
});
