import { Test, type TestingModule } from "@nestjs/testing";
import { MessagingGateway } from "../../messaging/messaging.gateway.js";
import { NotificationDeliveryService } from "./delivery.service.js";

describe("NotificationDeliveryService (P7.R6)", () => {
  it("emits to user room when gateway present", async () => {
    const emit = vi.fn();
    const gateway = { server: { to: vi.fn(() => ({ emit })) } };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [NotificationDeliveryService, { provide: MessagingGateway, useValue: gateway }],
    }).compile();
    const svc = moduleRef.get(NotificationDeliveryService);
    await svc.deliver("u1", { id: "n1", type: "GENERAL", title: "t", body: "b", link: null, createdAt: new Date() });
    expect(gateway.server.to).toHaveBeenCalledWith("user:u1");
    expect(emit).toHaveBeenCalled();
  });

  it("is no-op when gateway unavailable (worker)", async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [NotificationDeliveryService, { provide: MessagingGateway, useValue: undefined }],
    }).compile();
    const svc = moduleRef.get(NotificationDeliveryService);
    await expect(svc.deliver("u1", { id: "n1", type: "GENERAL", title: "t", body: "b", link: null, createdAt: new Date() })).resolves.toBeUndefined();
  });

  it("swallows delivery failure (PG truth)", async () => {
    const gateway = { server: { to: () => { throw new Error("socket down"); } } };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [NotificationDeliveryService, { provide: MessagingGateway, useValue: gateway }],
    }).compile();
    const svc = moduleRef.get(NotificationDeliveryService);
    await expect(svc.deliver("u1", { id: "n1", type: "GENERAL", title: "t", body: "b", link: null, createdAt: new Date() })).resolves.toBeUndefined();
  });
});
