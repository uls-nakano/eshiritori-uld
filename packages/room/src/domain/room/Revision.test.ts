import { getLogger, MemoryLogger, setLogger } from "@eshiritori/shared-kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Revision } from "./Revision";

const originalLogger = getLogger();
let memoryLogger: MemoryLogger;

beforeEach(() => {
  memoryLogger = new MemoryLogger();
  setLogger(memoryLogger);
});

afterEach(() => {
  setLogger(originalLogger);
});

describe("initial", () => {
  it("初期値はまだ保存されていない", () => {
    expect(Revision.initial().isInitial()).toBe(true);
    expect(Revision.initial().value).toBe(0);
  });
});

describe("restore", () => {
  it("1 以上の整数を受け付け、その値を持つ", () => {
    expect(Revision.restore(1).value).toBe(1);
    expect(Revision.restore(123456).value).toBe(123456);
  });

  it("0・負の数・小数・NaN は RangeError を throw する", () => {
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(() => Revision.restore(invalid)).toThrow(RangeError);
    }
  });

  it("throw する前に、原因の値を入れた error のログを出す", () => {
    expect(() => Revision.restore(0)).toThrow(RangeError);
    const entries = memoryLogger.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("error");
    expect(entries[0]?.context).toEqual({ value: 0 });
  });
});

describe("next", () => {
  it("初期値の次は、1 を復元したものと等しい", () => {
    expect(Revision.initial().next().equals(Revision.restore(1))).toBe(true);
  });

  it("復元した 5 の次は 6", () => {
    expect(Revision.restore(5).next().value).toBe(6);
  });

  it("元の値は変わらない", () => {
    const original = Revision.restore(5);
    original.next();
    expect(original.equals(Revision.restore(5))).toBe(true);
  });
});

describe("isInitial", () => {
  it("初期値なら true", () => {
    expect(Revision.initial().isInitial()).toBe(true);
  });

  it("復元した値（1）なら false", () => {
    expect(Revision.restore(1).isInitial()).toBe(false);
  });

  it("初期値の next() なら false", () => {
    expect(Revision.initial().next().isInitial()).toBe(false);
  });
});

describe("equals", () => {
  it("同じ回数なら等しい", () => {
    expect(Revision.restore(3).equals(Revision.restore(3))).toBe(true);
  });

  it("違う回数なら等しくない", () => {
    expect(Revision.restore(3).equals(Revision.restore(4))).toBe(false);
  });
});
