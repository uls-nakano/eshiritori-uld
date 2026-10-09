import { describe, expect, it } from "vitest";

import { CryptoRandomSource } from "./CryptoRandomSource";

describe("nextInt", () => {
  it("bound が 1 なら常に 0 を返す", () => {
    const random = new CryptoRandomSource();
    for (let i = 0; i < 100; i += 1) {
      expect(random.nextInt(1)).toBe(0);
    }
  });

  it.each([2, 36, 64])("bound %i のとき、0 以上 bound 未満の整数だけを返す", (bound) => {
    const random = new CryptoRandomSource();
    for (let i = 0; i < 2000; i += 1) {
      const value = random.nextInt(bound);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(bound);
    }
  });

  it("範囲のすべての値が出る", () => {
    const random = new CryptoRandomSource();
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      seen.add(random.nextInt(64));
    }
    expect(seen.size).toBe(64);
  });

  it("2 つの instance の並びは一致しない（決まった値を返していない）", () => {
    const first = new CryptoRandomSource();
    const second = new CryptoRandomSource();
    const firstValues = Array.from({ length: 32 }, () => first.nextInt(64));
    const secondValues = Array.from({ length: 32 }, () => second.nextInt(64));
    expect(firstValues).not.toEqual(secondValues);
  });
});
