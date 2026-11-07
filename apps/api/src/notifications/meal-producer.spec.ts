import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { KAFKA } from "../kafka/topics.js";

describe("meal.recorded producer (P7.R6)", () => {
  it("topic is declared", () => {
    expect((KAFKA.TOPICS as readonly string[])).toContain("meal.recorded");
  });

  it("MealsService enqueues meal.recorded with safe fields (no notes)", () => {
    const src = readFileSync(join(process.cwd(), "src/meals/meals.module.ts"), "utf8");
    expect(src).toContain('enqueue("meal.recorded"');
    expect(src).toContain("mealType");
    // Notes (free text) must not be copied into the event payload
    const enqueueIdx = src.indexOf('enqueue("meal.recorded"');
    const slice = src.slice(enqueueIdx, enqueueIdx + 260);
    expect(slice).not.toContain("dto.notes");
  });

  it("NotificationEventConsumer subscribes to meal.recorded", () => {
    const src = readFileSync(join(process.cwd(), "src/kafka/consumers.ts"), "utf8");
    expect(src).toContain("meal.recorded");
    expect(src).toContain("isAdminEvent");
  });
});
