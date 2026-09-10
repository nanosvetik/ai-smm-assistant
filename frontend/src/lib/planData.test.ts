import { describe, expect, it } from "vitest";
import { groupPostsByDay, sortedDays, weekdayLabel, type PlanPost } from "./planData";

const post = (day: number, platform: PlanPost["platform"]): PlanPost => ({
  day,
  platform,
  theme: "тема",
  title: "заголовок",
  pattern: null,
});

describe("weekdayLabel", () => {
  it("называет дни первой и второй недели", () => {
    expect(weekdayLabel(1)).toBe("Понедельник");
    expect(weekdayLabel(7)).toBe("Воскресенье");
    expect(weekdayLabel(8)).toBe("Понедельник");
    expect(weekdayLabel(14)).toBe("Воскресенье");
  });

  it("не выдаёт undefined на дне вне диапазона", () => {
    // День приходит из документа модели, бэкенд проверяет только тип: на нуле
    // и отрицательных индекс уходил за границы массива, и в сетке — как и в
    // выгрузке .xlsx — вместо дня недели печаталось «undefined».
    expect(weekdayLabel(0)).toBe("День 0");
    expect(weekdayLabel(-3)).toBe("День -3");
    expect(weekdayLabel(1.5)).toBe("День 1.5");
  });
});

describe("groupPostsByDay", () => {
  it("складывает посты одного дня по площадкам и сортирует дни", () => {
    const byDay = groupPostsByDay([post(3, "vk"), post(1, "telegram"), post(3, "telegram")]);
    expect(sortedDays(byDay)).toEqual([1, 3]);
    expect(Object.keys(byDay.get(3)!).sort()).toEqual(["telegram", "vk"]);
  });
});
