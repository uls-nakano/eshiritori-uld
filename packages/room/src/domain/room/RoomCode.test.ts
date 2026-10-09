import { isFailure, isSuccess } from "@eshiritori/shared-kernel";
import { describe, expect, it } from "vitest";

import type { RandomSource } from "../random/RandomSource";
import { RoomCode } from "./RoomCode";

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

function make(input: string): RoomCode {
  const result = RoomCode.create(input);
  if (!isSuccess(result)) throw new Error("expected success");
  return result.value;
}

function errorCodeOf(input: string): string {
  const result = RoomCode.create(input);
  if (!isFailure(result)) throw new Error("expected failure");
  return result.error.code;
}

describe("generate", () => {
  it("乱数の源に 36 未満の整数を 6 回求める", () => {
    const random = fixedRandom([0, 0, 0, 0, 0, 0]);
    RoomCode.generate(random);
    expect(random.bounds).toEqual([36, 36, 36, 36, 36, 36]);
  });

  it("乱数の値を英大文字と数字に対応させる", () => {
    expect(RoomCode.generate(fixedRandom([0, 25, 26, 35, 1, 27])).value).toBe("AZ09B1");
  });

  it("作った部屋コードは、その値から create したものと等しい", () => {
    const generated = RoomCode.generate(fixedRandom([0, 25, 26, 35, 1, 27]));
    expect(generated.equals(make("AZ09B1"))).toBe(true);
  });
});

describe("create", () => {
  it("英大文字と数字の 6 文字を受け付け、その値を持つ", () => {
    expect(make("K7Q2XM").value).toBe("K7Q2XM");
  });

  it("英小文字は大文字にそろえる", () => {
    expect(make("k7q2xm").value).toBe("K7Q2XM");
    expect(make("k7q2xm").equals(make("K7Q2XM"))).toBe(true);
  });

  it("前後の空白（全角空白も）を除く", () => {
    expect(make(" K7Q2XM ").value).toBe("K7Q2XM");
    expect(make("　K7Q2XM　").value).toBe("K7Q2XM");
  });

  it("全角の英数字を半角にそろえる", () => {
    expect(make("Ｋ７Ｑ２ＸＭ").value).toBe("K7Q2XM");
  });

  it("5 文字と 7 文字は room.room_not_found で拒否する", () => {
    expect(errorCodeOf("K7Q2X")).toBe("room.room_not_found");
    expect(errorCodeOf("K7Q2XMA")).toBe("room.room_not_found");
  });

  it("空文字と空白だけは room.room_not_found で拒否する", () => {
    expect(errorCodeOf("")).toBe("room.room_not_found");
    expect(errorCodeOf("   ")).toBe("room.room_not_found");
  });

  it("記号・ひらがな・途中の空白を含むものは room.room_not_found で拒否する", () => {
    expect(errorCodeOf("K7Q-XM")).toBe("room.room_not_found");
    expect(errorCodeOf("K7Qあい2")).toBe("room.room_not_found");
    expect(errorCodeOf("K7Q 2XM")).toBe("room.room_not_found");
  });

  it("大文字にすると英字に化ける文字は受け付けない", () => {
    // 大文字化すると "SSK7Q2" / "IK7Q2X" となり、先に大文字化すると書式を通ってしまう入力
    expect(errorCodeOf("ßK7Q2")).toBe("room.room_not_found");
    expect(errorCodeOf("ıK7Q2X")).toBe("room.room_not_found");
  });
});

describe("equals", () => {
  it("同じ値なら等しい", () => {
    expect(make("K7Q2XM").equals(make("K7Q2XM"))).toBe(true);
  });

  it("違う値なら等しくない", () => {
    expect(make("K7Q2XM").equals(make("K7Q2XN"))).toBe(false);
  });
});
