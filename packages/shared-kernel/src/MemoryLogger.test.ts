import { describe, expect, it } from "vitest";

import { MemoryLogger } from "./MemoryLogger";

describe("info", () => {
  it("レベルと message と context を 1 件記録する", () => {
    const logger = new MemoryLogger();
    logger.info("起動した", { port: 3000 });
    expect(logger.entries).toEqual([
      { level: "info", message: "起動した", context: { port: 3000 } },
    ]);
  });
});

describe("warn", () => {
  it("レベルと message と context を 1 件記録する", () => {
    const logger = new MemoryLogger();
    logger.warn("遅い", { ms: 900 });
    expect(logger.entries).toEqual([{ level: "warn", message: "遅い", context: { ms: 900 } }]);
  });
});

describe("error", () => {
  it("レベルと message と context を 1 件記録する", () => {
    const logger = new MemoryLogger();
    logger.error("失敗した", { roomId: "r1" });
    expect(logger.entries).toEqual([
      { level: "error", message: "失敗した", context: { roomId: "r1" } },
    ]);
  });

  it("stack を補わない", () => {
    const logger = new MemoryLogger();
    const context = { roomId: "r1" };
    logger.error("失敗した", context);
    expect(logger.entries[0]?.context).toEqual({ roomId: "r1" });
  });
});

describe("entries", () => {
  it("何も記録していなければ空になる", () => {
    expect(new MemoryLogger().entries).toEqual([]);
  });

  it("呼ばれた順に記録を返す", () => {
    const logger = new MemoryLogger();
    logger.error("a");
    logger.info("b");
    logger.warn("c");
    expect(logger.entries.map((entry) => entry.message)).toEqual(["a", "b", "c"]);
  });

  it("context を省いた記録は context が undefined になる", () => {
    const logger = new MemoryLogger();
    logger.info("a");
    expect(logger.entries[0]?.context).toBeUndefined();
  });

  it("別のインスタンスとは記録を共有しない", () => {
    const first = new MemoryLogger();
    const second = new MemoryLogger();
    first.info("a");
    expect(second.entries).toEqual([]);
  });
});
