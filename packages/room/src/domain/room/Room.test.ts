import { getLogger, MemoryLogger, setLogger } from "@eshiritori/shared-kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  fixedRandom,
  nicknameOf,
  ROOM_CREATED_AT,
  roomWith,
  roundCountOf,
  sequenceRandom,
} from "../../../fixtures/roomFixtures";
import { RoomError } from "../../errors/RoomError";
import { Member } from "./Member";
import { PlayerId } from "./PlayerId";
import { PlayerToken } from "./PlayerToken";
import { Revision } from "./Revision";
import type { RoomSnapshot } from "./Room";
import { Room } from "./Room";
import { RoomStatus } from "./RoomStatus";

const originalLogger = getLogger();
let memoryLogger: MemoryLogger;

beforeEach(() => {
  memoryLogger = new MemoryLogger();
  setLogger(memoryLogger);
});

afterEach(() => {
  setLogger(originalLogger);
});

function after(milliseconds: number): Date {
  return new Date(ROOM_CREATED_AT.getTime() + milliseconds);
}

const HOUR = 60 * 60 * 1000;

/** 呼び出しが throw した RoomError の code。throw しなければテストを失敗させる。 */
function errorCodeOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    if (error instanceof RoomError) return error.code;
    throw error;
  }
  throw new Error("expected RoomError");
}

function names(room: Room): string[] {
  return room.members.map((m) => m.nickname.value);
}

function snapshotOf(room: Room, overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    code: room.code,
    members: room.members,
    hostPlayerId: room.hostPlayerId,
    roundCount: room.roundCount,
    status: room.status,
    lastUpdatedAt: room.lastUpdatedAt,
    revision: room.revision,
    ...overrides,
  };
}

function startedFullRoom(): Room {
  const room = roomWith(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
  return Room.restore(snapshotOf(room, { status: RoomStatus.started() }));
}

describe("create", () => {
  it("作った人がホストとして、ただ 1 人のメンバーになる", () => {
    const room = Room.create(
      nicknameOf("たろう"),
      roundCountOf(1),
      ROOM_CREATED_AT,
      sequenceRandom(),
    );
    expect(room.members).toHaveLength(1);
    expect(room.host).toBe(room.members[0]);
    expect(room.hostPlayerId.equals(room.host.playerId)).toBe(true);
    expect(room.host.nickname.equals(nicknameOf("たろう"))).toBe(true);
  });

  it("部屋コードを乱数の源から作る", () => {
    const room = Room.create(
      nicknameOf("たろう"),
      roundCountOf(1),
      ROOM_CREATED_AT,
      sequenceRandom(),
    );
    expect(room.code.value).toBe("ABCDEF");
  });

  it("指定した周回数を持つ", () => {
    const room = Room.create(
      nicknameOf("たろう"),
      roundCountOf(3),
      ROOM_CREATED_AT,
      sequenceRandom(),
    );
    expect(room.roundCount.equals(roundCountOf(3))).toBe(true);
  });

  it("待機中で、まだ保存されていない", () => {
    const room = Room.create(
      nicknameOf("たろう"),
      roundCountOf(1),
      ROOM_CREATED_AT,
      sequenceRandom(),
    );
    expect(room.status.hasStarted()).toBe(false);
    expect(room.revision.isInitial()).toBe(true);
  });

  it("作った時刻が最後に更新した時刻になる", () => {
    const room = Room.create(
      nicknameOf("たろう"),
      roundCountOf(1),
      ROOM_CREATED_AT,
      sequenceRandom(),
    );
    expect(room.lastUpdatedAt.getTime()).toBe(ROOM_CREATED_AT.getTime());
  });

  it("ホストのトークンで findMember するとホストが見つかる", () => {
    const room = Room.create(
      nicknameOf("たろう"),
      roundCountOf(1),
      ROOM_CREATED_AT,
      sequenceRandom(),
    );
    expect(room.findMember(room.host.token)).toBe(room.host);
  });
});

describe("restore", () => {
  const room = roomWith(["たろう", "はなこ"]);

  it("渡した値をそのまま持つ", () => {
    const snapshot = snapshotOf(room, {
      status: RoomStatus.started(),
      revision: Revision.restore(3),
      lastUpdatedAt: after(HOUR),
    });
    const restored = Room.restore(snapshot);
    expect(restored.code.equals(snapshot.code)).toBe(true);
    expect(restored.members).toHaveLength(snapshot.members.length);
    restored.members.forEach((m, i) => {
      expect(m).toBe(snapshot.members[i]);
    });
    expect(restored.hostPlayerId.equals(snapshot.hostPlayerId)).toBe(true);
    expect(restored.roundCount.equals(snapshot.roundCount)).toBe(true);
    expect(restored.status.hasStarted()).toBe(true);
    expect(restored.lastUpdatedAt.getTime()).toBe(after(HOUR).getTime());
    expect(restored.revision.equals(Revision.restore(3))).toBe(true);
    expect(names(restored)).toEqual(["たろう", "はなこ"]);
  });

  it("渡したメンバーの配列や時刻を後から変えても、部屋の値は変わらない", () => {
    const members = [...room.members];
    const lastUpdatedAt = new Date(ROOM_CREATED_AT.getTime());
    const restored = Room.restore(snapshotOf(room, { members, lastUpdatedAt }));
    members.pop();
    lastUpdatedAt.setTime(0);
    expect(restored.members).toHaveLength(2);
    expect(restored.lastUpdatedAt.getTime()).toBe(ROOM_CREATED_AT.getTime());
    restored.lastUpdatedAt.setTime(0);
    expect(restored.lastUpdatedAt.getTime()).toBe(ROOM_CREATED_AT.getTime());
  });

  it("ホストがメンバーにいないスナップショットは Error を throw する", () => {
    const stranger = Member.restore(
      PlayerId.create("stranger"),
      PlayerToken.create("stranger-token"),
      nicknameOf("だれか"),
    );
    expect(() => Room.restore(snapshotOf(room, { hostPlayerId: stranger.playerId }))).toThrow(
      "Room host must be one of the members.",
    );
  });

  it("throw する前に、部屋コードとホストの識別子を入れた error のログを出す（トークンを含まない）", () => {
    const hostPlayerId = PlayerId.create("stranger");
    expect(() => Room.restore(snapshotOf(room, { hostPlayerId }))).toThrow(Error);
    const entries = memoryLogger.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("error");
    expect(entries[0]?.context).toEqual({ roomCode: room.code.value, hostPlayerId: "stranger" });
  });
});

describe("join", () => {
  it("入れる部屋なら、新しいメンバーが末尾に加わり、加わったメンバーを返す", () => {
    const room = roomWith(["たろう"]);
    const result = room.join(nicknameOf("はなこ"), after(HOUR), sequenceRandom());
    expect(names(room)).toEqual(["たろう", "はなこ"]);
    expect(room.members[1]).toBe(result);
  });

  it("加わったメンバーのトークンで findMember できる", () => {
    const room = roomWith(["たろう"]);
    const result = room.join(nicknameOf("はなこ"), after(HOUR), sequenceRandom());
    expect(room.findMember(result.token)).toBe(result);
  });

  it("最後に更新した時刻が入った時刻になり、改訂番号は変えない", () => {
    const room = roomWith(["たろう"]);
    room.join(nicknameOf("はなこ"), after(HOUR), sequenceRandom());
    expect(room.lastUpdatedAt.getTime()).toBe(after(HOUR).getTime());
    expect(room.revision.isInitial()).toBe(true);
  });

  it("7 人の部屋には入れて 8 人になる", () => {
    const room = roomWith(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
    const result = room.join(nicknameOf("a8"), after(HOUR), sequenceRandom());
    expect(result).toBeInstanceOf(Member);
    expect(room.members).toHaveLength(8);
  });

  it("8 人の部屋は room.room_full で拒否し、メンバーは 8 人のまま", () => {
    const room = roomWith(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    expect(errorCodeOf(() => room.join(nicknameOf("a9"), after(HOUR), sequenceRandom()))).toBe(
      "room.room_full",
    );
    expect(room.members).toHaveLength(8);
  });

  it("ゲームが始まった部屋は room.game_already_started で拒否する", () => {
    const room = roomWith(["たろう", "はなこ"]);
    room.start(room.host.token, after(HOUR), sequenceRandom());
    expect(
      errorCodeOf(() => room.join(nicknameOf("じろう"), after(2 * HOUR), sequenceRandom())),
    ).toBe("room.game_already_started");
  });

  it("同じニックネームのメンバーがいれば room.nickname_taken で拒否する", () => {
    const room = roomWith(["たろう", "はなこ"]);
    expect(
      errorCodeOf(() => room.join(nicknameOf(" はなこ "), after(HOUR), sequenceRandom())),
    ).toBe("room.nickname_taken");
  });

  it("ひらがなとカタカナの違いは別のニックネームとして入れる", () => {
    const room = roomWith(["はなこ"]);
    const result = room.join(nicknameOf("ハナコ"), after(HOUR), sequenceRandom());
    expect(result).toBeInstanceOf(Member);
  });

  describe("判断の順序", () => {
    it("始まった 8 人の部屋は game_already_started", () => {
      const room = startedFullRoom();
      expect(errorCodeOf(() => room.join(nicknameOf("a9"), after(HOUR), sequenceRandom()))).toBe(
        "room.game_already_started",
      );
    });

    it("8 人の部屋に同じニックネームで入ると room_full", () => {
      const room = roomWith(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
      expect(errorCodeOf(() => room.join(nicknameOf("a1"), after(HOUR), sequenceRandom()))).toBe(
        "room.room_full",
      );
    });
  });

  it("拒否したときは、メンバーも最後に更新した時刻も変わらない", () => {
    const room = roomWith(["たろう", "はなこ"]);
    expect(() => room.join(nicknameOf("はなこ"), after(HOUR), sequenceRandom())).toThrow(RoomError);
    expect(names(room)).toEqual(["たろう", "はなこ"]);
    expect(room.lastUpdatedAt.getTime()).toBe(ROOM_CREATED_AT.getTime());
  });

  it("拒否する前に、判断の原因を error のログに出す", () => {
    const room = roomWith(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
    errorCodeOf(() => room.join(nicknameOf("a9"), after(HOUR), sequenceRandom()));
    expect(memoryLogger.entries).toEqual([
      {
        level: "error",
        message: "満員の部屋には入れません",
        context: { roomCode: room.code.value, memberCount: 8 },
      },
    ]);
  });
});

describe("findMember", () => {
  const room = roomWith(["たろう", "はなこ"]);

  it("メンバーのトークンならそのメンバー", () => {
    const hanako = room.members[1];
    if (hanako === undefined) throw new Error("expected member");
    expect(room.findMember(hanako.token)).toBe(hanako);
  });

  it("どのメンバーのトークンでもなければ undefined", () => {
    expect(room.findMember(PlayerToken.create("unknown-token"))).toBeUndefined();
  });

  it("書式の誤ったトークンなら undefined", () => {
    expect(room.findMember(PlayerToken.create("not a token"))).toBeUndefined();
  });
});

describe("start", () => {
  function threeMembers(): Room {
    return roomWith(["たろう", "はなこ", "じろう"]);
  }

  it("ホストが 2 人以上の部屋で始めると true を返し、始まった状態になる", () => {
    const room = threeMembers();
    const result = room.start(room.host.token, after(HOUR), sequenceRandom());
    expect(result).toBe(true);
    expect(room.status.hasStarted()).toBe(true);
  });

  it("メンバーを並べ替え、その並びが描く順番になる", () => {
    const room = threeMembers();
    const random = fixedRandom([1, 1]);
    room.start(room.host.token, after(HOUR), random);
    expect(random.bounds).toEqual([3, 2]);
    expect(names(room)).toEqual(["はなこ", "じろう", "たろう"]);
  });

  it("乱数が毎回残りの先頭を指せば並びは変わらない", () => {
    const room = threeMembers();
    room.start(room.host.token, after(HOUR), fixedRandom([0, 0]));
    expect(names(room)).toEqual(["たろう", "はなこ", "じろう"]);
  });

  it("乱数が毎回残りの末尾を指せば逆順になる", () => {
    const room = threeMembers();
    room.start(room.host.token, after(HOUR), fixedRandom([2, 1]));
    expect(names(room)).toEqual(["じろう", "はなこ", "たろう"]);
  });

  it("最後に更新した時刻が開始の時刻になり、改訂番号は変えない", () => {
    const room = threeMembers();
    room.start(room.host.token, after(HOUR), sequenceRandom());
    expect(room.lastUpdatedAt.getTime()).toBe(after(HOUR).getTime());
    expect(room.revision.isInitial()).toBe(true);
  });

  it("ホスト以外のメンバーのトークンは room.not_host で拒否し、始まらない", () => {
    const room = threeMembers();
    const guest = room.members[1];
    if (guest === undefined) throw new Error("expected member");
    expect(errorCodeOf(() => room.start(guest.token, after(HOUR), sequenceRandom()))).toBe(
      "room.not_host",
    );
    expect(room.status.hasStarted()).toBe(false);
  });

  it("メンバーでないトークン・書式の誤ったトークンは room.not_host で拒否する", () => {
    const room = threeMembers();
    for (const value of ["unknown-token", "not a token"]) {
      expect(
        errorCodeOf(() => room.start(PlayerToken.create(value), after(HOUR), sequenceRandom())),
      ).toBe("room.not_host");
    }
  });

  it("ホスト 1 人だけの部屋は room.not_enough_members で拒否し、始まらない", () => {
    const room = roomWith(["たろう"]);
    expect(errorCodeOf(() => room.start(room.host.token, after(HOUR), sequenceRandom()))).toBe(
      "room.not_enough_members",
    );
    expect(room.status.hasStarted()).toBe(false);
  });

  it("既に始まった部屋にホストがもう一度要求すると false を返し、並び・時刻は変わらず、乱数の源にも尋ねない", () => {
    const room = threeMembers();
    room.start(room.host.token, after(HOUR), fixedRandom([2, 1]));
    const before = names(room);
    const result = room.start(room.host.token, after(2 * HOUR), fixedRandom([]));
    expect(result).toBe(false);
    expect(names(room)).toEqual(before);
    expect(room.lastUpdatedAt.getTime()).toBe(after(HOUR).getTime());
  });

  it("既に始まった部屋への、ホスト以外のメンバーの要求は room.not_host", () => {
    const room = threeMembers();
    room.start(room.host.token, after(HOUR), sequenceRandom());
    const guest = room.members.find((m) => !m.playerId.equals(room.hostPlayerId));
    if (guest === undefined) throw new Error("expected member");
    expect(errorCodeOf(() => room.start(guest.token, after(2 * HOUR), sequenceRandom()))).toBe(
      "room.not_host",
    );
  });

  it("拒否する前に、判断の原因を error のログに出す", () => {
    const room = roomWith(["たろう"]);
    errorCodeOf(() => room.start(room.host.token, after(HOUR), sequenceRandom()));
    expect(memoryLogger.entries).toEqual([
      {
        level: "error",
        message: "人数が足りないのでゲームを始められません",
        context: { roomCode: room.code.value, memberCount: 1 },
      },
    ]);
  });
});

describe("isExpiredAt", () => {
  const day = 24 * HOUR;

  it("最後に更新してから 24 時間に 1 ミリ秒足りなければ false", () => {
    expect(roomWith(["たろう"]).isExpiredAt(after(day - 1))).toBe(false);
  });

  it("ちょうど 24 時間たっていれば true、それより後も true", () => {
    const room = roomWith(["たろう"]);
    expect(room.isExpiredAt(after(day))).toBe(true);
    expect(room.isExpiredAt(after(day + 1))).toBe(true);
  });

  it("メンバーが入ると、入った時刻から測り直す", () => {
    const room = roomWith(["たろう"]);
    room.join(nicknameOf("はなこ"), after(23 * HOUR), sequenceRandom());
    expect(room.isExpiredAt(after(day))).toBe(false);
    expect(room.isExpiredAt(after(47 * HOUR))).toBe(true);
  });

  it("開始すると、開始の時刻から測り直す", () => {
    const room = roomWith(["たろう", "はなこ"]);
    room.start(room.host.token, after(23 * HOUR), sequenceRandom());
    expect(room.isExpiredAt(after(day))).toBe(false);
    expect(room.isExpiredAt(after(47 * HOUR))).toBe(true);
  });
});
