import { describe, expect, it } from "vitest";

import type { RandomSource } from "../random/RandomSource";
import { PlayerId } from "./PlayerId";

function fixedRandom(values: readonly number[]): RandomSource & { readonly bounds: number[] } {
  const bounds: number[] = [];
  let index = 0;
  return {
    bounds,
    nextInt(bound: number): number {
      bounds.push(bound);
      const value = values[index];
      if (value === undefined) throw new Error("random values exhausted");
      index += 1;
      return value;
    },
  };
}

describe("generate", () => {
  it("乱数の源に 64 未満の整数を 12 回求める", () => {
    const random = fixedRandom(Array.from({ length: 12 }, () => 0));
    PlayerId.generate(random);
    expect(random.bounds).toEqual(Array.from({ length: 12 }, () => 64));
  });

  it("乱数の値を base64url の文字に対応させる", () => {
    const random = fixedRandom([0, 25, 26, 51, 52, 61, 62, 63, 0, 0, 0, 0]);
    expect(PlayerId.generate(random).value).toBe("AZaz09-_AAAA");
  });
});

describe("create", () => {
  it("渡された値をそのまま持つ", () => {
    expect(PlayerId.create("anything goes").value).toBe("anything goes");
  });
});

describe("equals", () => {
  it("同じ値なら等しい", () => {
    expect(PlayerId.create("abc").equals(PlayerId.create("abc"))).toBe(true);
  });

  it("違う値なら等しくない", () => {
    expect(PlayerId.create("abc").equals(PlayerId.create("abd"))).toBe(false);
  });
});
