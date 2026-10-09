import { describe, expect, it } from "vitest";

import { fixedRandom, nicknameOf, sequenceRandom } from "../../../fixtures/roomFixtures";
import { Member } from "./Member";
import { PlayerId } from "./PlayerId";
import { PlayerToken } from "./PlayerToken";

describe("create", () => {
  it("渡したニックネームを持つ", () => {
    const member = Member.create(nicknameOf("たろう"), sequenceRandom());
    expect(member.nickname.equals(nicknameOf("たろう"))).toBe(true);
  });

  it("乱数の源に 64 未満の整数を 44 回求める（識別子 12 文字・トークン 32 文字）", () => {
    const random = fixedRandom(Array.from({ length: 44 }, () => 0));
    Member.create(nicknameOf("たろう"), random);
    expect(random.bounds).toHaveLength(44);
    expect(random.bounds.every((bound) => bound === 64)).toBe(true);
  });

  it("続けて作った 2 人は、識別子もトークンも違う", () => {
    const random = sequenceRandom();
    const first = Member.create(nicknameOf("たろう"), random);
    const second = Member.create(nicknameOf("はなこ"), random);
    expect(first.playerId.equals(second.playerId)).toBe(false);
    expect(first.token.equals(second.token)).toBe(false);
  });
});

describe("restore", () => {
  it("渡した識別子・トークン・ニックネームを持つ", () => {
    const playerId = PlayerId.create("abc");
    const token = PlayerToken.create("secret");
    const member = Member.restore(playerId, token, nicknameOf("たろう"));
    expect(member.playerId.equals(playerId)).toBe(true);
    expect(member.token.equals(token)).toBe(true);
    expect(member.nickname.equals(nicknameOf("たろう"))).toBe(true);
  });
});

describe("isHeldBy", () => {
  const random = sequenceRandom();
  const member = Member.create(nicknameOf("たろう"), random);
  const other = Member.create(nicknameOf("はなこ"), random);

  it("自分のトークンなら true", () => {
    expect(member.isHeldBy(member.token)).toBe(true);
  });

  it("ほかのメンバーのトークンなら false", () => {
    expect(member.isHeldBy(other.token)).toBe(false);
  });

  it("書式の誤ったトークンなら false", () => {
    expect(member.isHeldBy(PlayerToken.create("not a token"))).toBe(false);
  });
});

describe("isNamed", () => {
  const member = Member.create(nicknameOf("はなこ"), sequenceRandom());

  it("同じニックネームなら true", () => {
    expect(member.isNamed(nicknameOf("はなこ"))).toBe(true);
  });

  it("前後に空白を付けて作ったニックネームでも true", () => {
    expect(member.isNamed(nicknameOf("  はなこ "))).toBe(true);
  });

  it("ひらがなとカタカナは別のニックネーム", () => {
    expect(member.isNamed(nicknameOf("ハナコ"))).toBe(false);
  });
});
