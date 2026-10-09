import { isFailure, isSuccess } from "@eshiritori/shared-kernel";
import { describe, expect, it } from "vitest";

import { RoundCount } from "./RoundCount";

function make(input: number): RoundCount {
  const result = RoundCount.create(input);
  if (!isSuccess(result)) throw new Error("expected success");
  return result.value;
}

function expectRejected(input: number): void {
  const result = RoundCount.create(input);
  if (!isFailure(result)) throw new Error("expected failure");
  expect(result.error.code).toBe("room.round_count_out_of_range");
}

describe("create", () => {
  it("下限の 1 と上限の 5 を受け付け、その値を持つ", () => {
    expect(make(1).value).toBe(1);
    expect(make(5).value).toBe(5);
  });

  it("0 と 6 を room.round_count_out_of_range で拒否する", () => {
    expectRejected(0);
    expectRejected(6);
  });

  it("負の数を拒否する", () => {
    expectRejected(-1);
  });

  it("整数でない値を拒否する", () => {
    expectRejected(1.5);
  });

  it("NaN と Infinity を拒否する", () => {
    expectRejected(Number.NaN);
    expectRejected(Number.POSITIVE_INFINITY);
  });
});

describe("equals", () => {
  it("同じ周回数なら等しい", () => {
    expect(make(3).equals(make(3))).toBe(true);
  });

  it("違う周回数なら等しくない", () => {
    expect(make(3).equals(make(4))).toBe(false);
  });
});
