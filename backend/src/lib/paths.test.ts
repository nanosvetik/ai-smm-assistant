import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DB_PATH, PROJECT_ROOT, UPLOAD_ROOT, promptPath } from "./paths.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const tsxCli = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

// Раньше пути считались от process.cwd(). Всё работало, пока процесс
// запускали из backend/, и ломалось молча при любом другом запуске: промпты не
// находились, а better-sqlite3 вместо ошибки создавал новую пустую базу.
// Поэтому проверка запускает модуль отдельным процессом из чужой директории —
// сам vitest стартует из backend/, где ошибка бы не проявилась.
describe("пути не зависят от рабочей директории", () => {
  it("резолвит корень проекта при запуске из посторонней директории", () => {
    const modulePath = path.join(thisDir, "paths.ts").replace(/\\/g, "/");
    const output = execFileSync(
      process.execPath,
      [tsxCli, "-e", `import { PROJECT_ROOT, DB_PATH } from "${modulePath}"; console.log(JSON.stringify({ PROJECT_ROOT, DB_PATH }));`],
      { cwd: tmpdir(), encoding: "utf8" }
    );

    const parsed = JSON.parse(output.trim().split("\n").pop()!);
    expect(parsed.PROJECT_ROOT).toBe(PROJECT_ROOT);
    expect(parsed.DB_PATH).toBe(DB_PATH);
  });

  it("указывает на существующие каталоги проекта", () => {
    expect(existsSync(path.join(PROJECT_ROOT, "prompts"))).toBe(true);
    expect(existsSync(promptPath("copywriter.md"))).toBe(true);
    expect(path.dirname(UPLOAD_ROOT)).toBe(PROJECT_ROOT);
  });
});
