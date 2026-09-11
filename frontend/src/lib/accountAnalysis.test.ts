import { describe, expect, it } from "vitest";
import { accountAnalysisFoundNoPosts, foundNoPosts } from "./accountAnalysis";
import type { StageResult } from "./stageProgress";
import type { AgentResult } from "./api";

const analysis = (postsAnalyzed?: number): AgentResult =>
  ({ status: "черновик-скелет", ...(postsAnalyzed === undefined ? {} : { postsAnalyzed }) }) as unknown as AgentResult;

describe("foundNoPosts", () => {
  it("срабатывает ровно на нуле разобранных постов", () => {
    expect(foundNoPosts(analysis(0))).toBe(true);
    expect(foundNoPosts(analysis(20))).toBe(false);
  });

  it("молчит, когда поля нет или этап не запускали", () => {
    // Поле приходит через индексную сигнатуру AgentResult: у документа без
    // него «ноль постов» утверждать нельзя.
    expect(foundNoPosts(analysis())).toBe(false);
    expect(foundNoPosts(null)).toBe(false);
  });
});

describe("accountAnalysisFoundNoPosts", () => {
  it("смотрит именно на анализ аккаунта", () => {
    const results: Record<string, StageResult> = { "account-analyzer": analysis(0), audience: analysis(20) };
    expect(accountAnalysisFoundNoPosts(results)).toBe(true);
  });

  it("не срабатывает, когда посты разобраны или этап не запускали", () => {
    expect(accountAnalysisFoundNoPosts({ "account-analyzer": analysis(12) })).toBe(false);
    expect(accountAnalysisFoundNoPosts({ "account-analyzer": null })).toBe(false);
    expect(accountAnalysisFoundNoPosts({})).toBe(false);
  });
});
