import { describe, expect, it, vi } from "vitest";

import { ConsoleLogger } from "./ConsoleLogger";
import type { Logger } from "./Logger";

function createOutput() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("constructor", () => {
  it("出力先を省くと既定の出力先を使う", () => {
    const output = createOutput();
    vi.stubGlobal("console", output);
    try {
      const logger: Logger = new ConsoleLogger();
      logger.info("x");
      expect(output.info).toHaveBeenCalledWith("x");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("info", () => {
  it("message と context を console の info に渡す", () => {
    const output = createOutput();
    new ConsoleLogger(output).info("起動した", { port: 3000 });
    expect(output.info).toHaveBeenCalledWith("起動した", { port: 3000 });
  });

  it("context が無ければ message だけを渡す", () => {
    const output = createOutput();
    new ConsoleLogger(output).info("起動した");
    expect(output.info).toHaveBeenCalledWith("起動した");
  });

  it("stack を足さない", () => {
    const output = createOutput();
    new ConsoleLogger(output).info("起動した", { port: 3000 });
    expect(output.info.mock.calls[0]?.[1]).not.toHaveProperty("stack");
  });
});

describe("warn", () => {
  it("message と context を console の warn に渡す", () => {
    const output = createOutput();
    new ConsoleLogger(output).warn("遅い", { ms: 900 });
    expect(output.warn).toHaveBeenCalledWith("遅い", { ms: 900 });
  });

  it("context が無ければ message だけを渡す", () => {
    const output = createOutput();
    new ConsoleLogger(output).warn("遅い");
    expect(output.warn).toHaveBeenCalledWith("遅い");
  });
});

describe("error", () => {
  it("message と、context に stack を足したものを console の error に渡す", () => {
    const output = createOutput();
    new ConsoleLogger(output).error("失敗した", { roomId: "r1" });
    expect(output.error).toHaveBeenCalledWith(
      "失敗した",
      expect.objectContaining({ roomId: "r1", stack: expect.any(String) as string }),
    );
  });

  it("stack の先頭の frame は呼び出し元で、logger 内部の frame を含まない", () => {
    const output = createOutput();
    function callerOfLogger() {
      new ConsoleLogger(output).error("失敗した");
    }
    callerOfLogger();
    const stack = (output.error.mock.calls[0]?.[1] as { stack: string }).stack;
    const firstLine = stack.split("\n")[0] ?? "";
    expect(firstLine).toContain("callerOfLogger");
    // テストファイル名（ConsoleLogger.test.ts）自体に logger 名が含まれるため、実装ファイルの frame だけを除外対象にする
    expect(firstLine).not.toMatch(/ConsoleLogger\.ts:/);
    expect(firstLine).not.toContain("ConsoleLogger.error");
  });

  it("context に stack があれば上書きしない", () => {
    const output = createOutput();
    new ConsoleLogger(output).error("失敗した", { stack: "captured" });
    expect(output.error).toHaveBeenCalledWith("失敗した", { stack: "captured" });
  });

  it("context が無くても stack だけの context を渡す", () => {
    const output = createOutput();
    new ConsoleLogger(output).error("失敗した");
    expect(output.error).toHaveBeenCalledWith("失敗した", { stack: expect.any(String) as string });
  });
});
