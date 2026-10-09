import { describe, expect, it } from "vitest";

import type { RandomSource } from "../random/RandomSource";
import { PlayerToken } from "./PlayerToken";

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

const BOUNDARY_VALUES = [0, 25, 26, 51, 52, 61, 62, 63];

describe("generate", () => {
  it("乱数の源に 64 未満の整数を 32 回求める", () => {
    const random = fixedRandom(Array.from({ length: 32 }, () => 0));
    PlayerToken.generate(random);
    expect(random.bounds).toEqual(Array.from({ length: 32 }, () => 64));
  });

  it("乱数の値を base64url の文字に対応させる", () => {
    const values = [...BOUNDARY_VALUES, ...BOUNDARY_VALUES, ...BOUNDARY_VALUES, ...BOUNDARY_VALUES];
    expect(PlayerToken.generate(fixedRandom(values)).value).toBe("AZaz09-_".repeat(4));
  });
});

describe("create", () => {
  it("渡された値をそのまま持つ（生成の書式に合わない値も持つ）", () => {
    expect(PlayerToken.create("not a token!").value).toBe("not a token!");
  });
});

describe("equals", () => {
  const base = "A".repeat(32);

  it("同じ値なら等しい", () => {
    expect(PlayerToken.create(base).equals(PlayerToken.create(base))).toBe(true);
  });

  it("先頭の 1 文字だけ違えば等しくない", () => {
    expect(PlayerToken.create(base).equals(PlayerToken.create(`B${base.slice(1)}`))).toBe(false);
  });

  it("末尾の 1 文字だけ違えば等しくない", () => {
    expect(PlayerToken.create(base).equals(PlayerToken.create(`${base.slice(0, -1)}B`))).toBe(
      false,
    );
  });

  it("一方が他方の先頭部分（長さが違う）なら等しくない", () => {
    expect(PlayerToken.create(base).equals(PlayerToken.create(base.slice(0, 16)))).toBe(false);
    expect(PlayerToken.create(base.slice(0, 16)).equals(PlayerToken.create(base))).toBe(false);
  });

  it("空文字のトークン同士は等しく、空文字と空でないトークンは等しくない", () => {
    expect(PlayerToken.create("").equals(PlayerToken.create(""))).toBe(true);
    expect(PlayerToken.create("").equals(PlayerToken.create(base))).toBe(false);
  });
});
