import { getLogger, isSuccess, MemoryLogger, setLogger } from "@eshiritori/shared-kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ROOM_CREATED_AT, roomWith, sequenceRandom } from "../../../fixtures/roomFixtures";
import { Revision } from "../../domain/room/Revision";
import { Room } from "../../domain/room/Room";
import { RoomItemMapper } from "./RoomItemMapper";
import { roomTable } from "./roomTable";

const originalLogger = getLogger();
let memoryLogger: MemoryLogger;

beforeEach(() => {
  memoryLogger = new MemoryLogger();
  setLogger(memoryLogger);
});

afterEach(() => {
  setLogger(originalLogger);
});

const mapper = new RoomItemMapper();

function startedRoom(): Room {
  const room = roomWith(["あや", "いけ", "うみ"]);
  const token = room.host.token;
  const started = room.start(token, ROOM_CREATED_AT, sequenceRandom());
  if (!isSuccess(started)) {
    throw new Error("fixture start failed");
  }
  return room;
}

function validItem(): Record<string, unknown> {
  return { ...mapper.toItem(roomWith(["あや", "いけ"]), Revision.restore(3)) };
}

describe("toItem", () => {
  it("部屋の値を項目の属性に写す", () => {
    const room = roomWith(["あや", "いけ"]);
    const item = mapper.toItem(room, Revision.restore(1));
    expect(item.roomCode).toBe(room.code.value);
    expect(item.hostPlayerId).toBe(room.hostPlayerId.value);
    expect(item.roundCount).toBe(1);
    expect(item.members).toEqual(
      room.members.map((m) => ({
        playerId: m.playerId.value,
        token: m.token.value,
        nickname: m.nickname.value,
      })),
    );
  });

  it("メンバーの並びを保つ（開始後は描く順のまま）", () => {
    const room = startedRoom();
    const item = mapper.toItem(room, Revision.restore(1));
    expect(item.members.map((m) => m.playerId)).toEqual(room.members.map((m) => m.playerId.value));
  });

  it("進行状態を待機中は waiting、始まっていれば started で書く", () => {
    expect(mapper.toItem(roomWith(["あや"]), Revision.restore(1)).status).toBe("waiting");
    expect(mapper.toItem(startedRoom(), Revision.restore(1)).status).toBe("started");
  });

  it("最後に更新した時刻を UTC の ISO 8601（ミリ秒まで）で書く", () => {
    const room = roomWith(["あや"], new Date("2026-10-09T09:00:00.123Z"));
    expect(mapper.toItem(room, Revision.restore(1)).lastUpdatedAt).toBe("2026-10-09T09:00:00.123Z");
  });

  it("渡された改訂番号を書く（集約の改訂番号ではなく引数の値）", () => {
    const room = roomWith(["あや"]);
    expect(mapper.toItem(room, Revision.restore(7)).revision).toBe(7);
  });

  it.each([0, 1, 999])(
    "期限の属性はドメインが期限切れと判断する時刻のエポック秒になる（端数 %i ミリ秒）",
    (milliseconds) => {
      const room = roomWith(["あや"], new Date(ROOM_CREATED_AT.getTime() + milliseconds));
      const { expiresAt } = mapper.toItem(room, Revision.restore(1));
      expect(room.isExpiredAt(new Date(expiresAt * 1000))).toBe(true);
      expect(room.isExpiredAt(new Date((expiresAt - 1) * 1000))).toBe(false);
    },
  );

  it("期限の属性名は表の定義の期限の属性名と一致する", () => {
    const item = mapper.toItem(roomWith(["あや"]), Revision.restore(1));
    expect(Object.keys(item)).toContain(roomTable.timeToLiveAttributeName);
  });
});

describe("toRoom", () => {
  it("toItem で書いた項目から同じ部屋を復元する", () => {
    const room = roomWith(["あや", "いけ", "うみ"], new Date("2026-10-09T09:00:00.456Z"));
    const restored = mapper.toRoom(mapper.toItem(room, Revision.restore(5)));
    expect(restored.code.equals(room.code)).toBe(true);
    expect(
      restored.members.map((m) => [m.playerId.value, m.token.value, m.nickname.value]),
    ).toEqual(room.members.map((m) => [m.playerId.value, m.token.value, m.nickname.value]));
    expect(restored.hostPlayerId.equals(room.hostPlayerId)).toBe(true);
    expect(restored.roundCount.value).toBe(room.roundCount.value);
    expect(restored.status.equals(room.status)).toBe(true);
    expect(restored.lastUpdatedAt.getTime()).toBe(room.lastUpdatedAt.getTime());
    expect(restored.revision.value).toBe(5);
  });

  it("始まった部屋を始まった状態で、描く順の並びのまま復元する", () => {
    const room = startedRoom();
    const restored = mapper.toRoom(mapper.toItem(room, Revision.restore(2)));
    expect(restored.status.hasStarted()).toBe(true);
    expect(restored.members.map((m) => m.playerId.value)).toEqual(
      room.members.map((m) => m.playerId.value),
    );
  });

  it.each([
    ["項目が object でない", () => "x", "item"],
    ["部屋コードが無い", () => ({ ...validItem(), roomCode: undefined }), "roomCode"],
    ["メンバーが配列でない", () => ({ ...validItem(), members: "x" }), "members"],
    [
      "メンバーの属性が欠けている",
      () => ({ ...validItem(), members: [{ playerId: "a" }] }),
      "members.member",
    ],
    ["ホストが文字列でない", () => ({ ...validItem(), hostPlayerId: 1 }), "hostPlayerId"],
    ["周回数が数でない", () => ({ ...validItem(), roundCount: "1" }), "roundCount"],
    ["未知の進行状態", () => ({ ...validItem(), status: "finished" }), "status"],
    ["時刻が文字列でない", () => ({ ...validItem(), lastUpdatedAt: 1 }), "lastUpdatedAt"],
    ["時刻が日時として読めない", () => ({ ...validItem(), lastUpdatedAt: "x" }), "lastUpdatedAt"],
    ["改訂番号が数でない", () => ({ ...validItem(), revision: "1" }), "revision"],
  ])("形の誤り（%s）は throw し、外れた属性名を log に出す", (_name, build, attribute) => {
    expect(() => mapper.toRoom(build())).toThrow(`Stored room item is invalid: ${attribute}`);
    const entry = memoryLogger.entries.at(-1);
    expect(entry?.level).toBe("error");
    expect(entry?.context).toMatchObject({ attribute });
  });

  it("形の誤りの log に部屋コードを出す", () => {
    const valid = validItem();
    expect(() => mapper.toRoom({ ...valid, status: "finished" })).toThrow();
    expect(memoryLogger.entries.at(-1)?.context).toMatchObject({ roomCode: valid["roomCode"] });
  });

  it.each([
    ["書式の誤った部屋コード", () => ({ ...validItem(), roomCode: "!" }), "roomCode"],
    ["範囲外の周回数", () => ({ ...validItem(), roundCount: 0 }), "roundCount"],
    [
      "空のニックネーム",
      () => ({
        ...validItem(),
        members: [{ playerId: "a", token: "b", nickname: "" }],
      }),
      "members.nickname",
    ],
  ])("値の誤り（%s）は throw し、外れた属性名を log に出す", (_name, build, attribute) => {
    expect(() => mapper.toRoom(build())).toThrow(`Stored room item is invalid: ${attribute}`);
    expect(memoryLogger.entries.at(-1)?.context).toMatchObject({ attribute });
  });

  it("log にトークンを出さない", () => {
    const room = roomWith(["あや", "いけ"]);
    const item = { ...mapper.toItem(room, Revision.restore(3)) };
    const tokens = room.members.map((m) => m.token.value);
    const broken = [
      { ...item, status: "finished" },
      { ...item, roundCount: 0 },
    ];
    for (const b of broken) {
      expect(() => mapper.toRoom(b)).toThrow();
    }
    const logged = JSON.stringify(memoryLogger.entries);
    for (const token of tokens) {
      expect(logged).not.toContain(token);
    }
  });

  it("改訂番号が 0 の項目は throw する", () => {
    expect(() => mapper.toRoom({ ...validItem(), revision: 0 })).toThrow(RangeError);
  });

  it("ホストがメンバーにいない項目は throw する", () => {
    expect(() => mapper.toRoom({ ...validItem(), hostPlayerId: "nobody" })).toThrow(
      "Room host must be one of the members.",
    );
  });
});
