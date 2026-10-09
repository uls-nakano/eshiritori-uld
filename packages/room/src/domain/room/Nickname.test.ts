import { isFailure, isSuccess } from "@eshiritori/shared-kernel";
import { describe, expect, it } from "vitest";

import { Nickname } from "./Nickname";

function valueOf(input: string): string {
  const result = Nickname.create(input);
  if (!isSuccess(result)) throw new Error("expected success");
  return result.value.value;
}

function errorCodeOf(input: string): string {
  const result = Nickname.create(input);
  if (!isFailure(result)) throw new Error("expected failure");
  return result.error.code;
}

function make(input: string): Nickname {
  const result = Nickname.create(input);
  if (!isSuccess(result)) throw new Error("expected success");
  return result.value;
}

const FAMILY = "👨‍👩‍👧‍👦";
const FLAG = "🇯🇵";

describe("create", () => {
  it("前後の空白を除いた値を持つ", () => {
    expect(valueOf("  たろう  ")).toBe("たろう");
  });

  it("全角の空白も前後の空白として除く", () => {
    expect(valueOf("　たろう　")).toBe("たろう");
  });

  it("空文字は room.nickname_empty で拒否する", () => {
    expect(errorCodeOf("")).toBe("room.nickname_empty");
  });

  it("空白だけ（半角・全角・タブの混在）は room.nickname_empty で拒否する", () => {
    expect(errorCodeOf(" 　\t 　")).toBe("room.nickname_empty");
  });

  it("10 文字ちょうどは受け付ける", () => {
    expect(valueOf("じゅげむじゅげむごこ")).toBe("じゅげむじゅげむごこ");
  });

  it("11 文字は room.nickname_too_long で拒否する", () => {
    expect(errorCodeOf("じゅげむじゅげむごこう")).toBe("room.nickname_too_long");
  });

  it("前後の空白を除いて 10 文字なら、空白込みで 10 文字を超えていても受け付ける", () => {
    expect(valueOf("  じゅげむじゅげむごこ  ")).toBe("じゅげむじゅげむごこ");
  });

  it("ZWJ で連結した絵文字と国旗を 1 文字として数える", () => {
    expect(valueOf(FAMILY.repeat(10))).toBe(FAMILY.repeat(10));
    expect(errorCodeOf(FAMILY.repeat(11))).toBe("room.nickname_too_long");
    expect(valueOf(FLAG.repeat(10))).toBe(FLAG.repeat(10));
    expect(errorCodeOf(FLAG.repeat(11))).toBe("room.nickname_too_long");
  });

  it("文字の種類を制限しない", () => {
    expect(valueOf("山田Ab1!😀")).toBe("山田Ab1!😀");
  });

  it("名前の途中の空白は残す", () => {
    expect(valueOf("たろう じろう")).toBe("たろう じろう");
  });
});

describe("equals", () => {
  it("同じ値なら等しい", () => {
    expect(make("たろう").equals(make("たろう"))).toBe(true);
  });

  it("前後の空白だけが違う入力から作ったものは等しい", () => {
    expect(make(" たろう").equals(make("たろう "))).toBe(true);
  });

  it("ひらがなとカタカナは別のニックネームとして扱う", () => {
    expect(make("はなこ").equals(make("ハナコ"))).toBe(false);
  });

  it("違う値なら等しくない", () => {
    expect(make("たろう").equals(make("じろう"))).toBe(false);
  });
});
