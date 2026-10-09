import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

async function load() {
  const { getLogger, setLogger } = await import("./getLogger");
  const { ConsoleLogger } = await import("./ConsoleLogger");
  const { MemoryLogger } = await import("./MemoryLogger");
  return { getLogger, setLogger, ConsoleLogger, MemoryLogger };
}

describe("getLogger", () => {
  it("差し替えていなければ ConsoleLogger を返す", async () => {
    const { getLogger, ConsoleLogger } = await load();
    expect(getLogger()).toBeInstanceOf(ConsoleLogger);
  });

  it("何度呼んでも同じ logger を返す", async () => {
    const { getLogger } = await load();
    expect(getLogger()).toBe(getLogger());
  });
});

describe("setLogger", () => {
  it("差し替えた後は、差し替えた logger を返す", async () => {
    const { getLogger, setLogger, MemoryLogger } = await load();
    const memory = new MemoryLogger();
    setLogger(memory);
    getLogger().error("失敗した", { roomId: "r1" });
    expect(getLogger()).toBe(memory);
    expect(memory.entries).toEqual([
      { level: "error", message: "失敗した", context: { roomId: "r1" } },
    ]);
  });
});
