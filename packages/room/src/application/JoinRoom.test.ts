import type { Result } from "@eshiritori/shared-kernel";
import { failure, getLogger, MemoryLogger, setLogger, success } from "@eshiritori/shared-kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ROOM_CREATED_AT, roomWith, sequenceRandom } from "../../fixtures/roomFixtures";
import type { Room } from "../domain/room/Room";
import type { RoomCode } from "../domain/room/RoomCode";
import type { RoomRepository, RoomSaveConflict } from "../domain/room/RoomRepository";
import { RoomError } from "../errors/RoomError";
import { JoinRoom } from "./JoinRoom";
import type { RoomEventPublisher } from "./RoomEventPublisher";
import type { RoomSnapshotDto } from "./RoomSnapshotDto";

const HOUR = 60 * 60 * 1000;

/** 渡された部屋を順に返し（尽きたら最後の部屋）、保存を記録し、最初の conflicts 回だけ save_conflict を返す fake。 */
class FakeRoomRepository implements RoomRepository {
  readonly saved: Room[] = [];
  readonly requestedCodes: string[] = [];
  attempts = 0;
  readonly #rooms: readonly (Room | undefined)[];
  readonly #conflicts: number;

  constructor(rooms: readonly (Room | undefined)[], conflicts = 0) {
    this.#rooms = rooms;
    this.#conflicts = conflicts;
  }

  findByCode(code: RoomCode): Promise<Room | undefined> {
    const index = Math.min(this.requestedCodes.length, this.#rooms.length - 1);
    this.requestedCodes.push(code.value);
    return Promise.resolve(this.#rooms[index]);
  }

  save(room: Room): Promise<Result<void, RoomSaveConflict>> {
    this.attempts += 1;
    if (this.attempts <= this.#conflicts) {
      return Promise.resolve(failure("save_conflict"));
    }
    this.saved.push(room);
    return Promise.resolve(success());
  }
}

/** 知らせた写しを記録する fake。failWith を指定すると、知らせるときにその例外を投げる。 */
class RecordingRoomEventPublisher implements RoomEventPublisher {
  readonly memberJoined: RoomSnapshotDto[] = [];
  readonly gameStarted: RoomSnapshotDto[] = [];
  readonly #failWith: Error | undefined;

  constructor(failWith?: Error) {
    this.#failWith = failWith;
  }

  publishMemberJoined(room: RoomSnapshotDto): Promise<void> {
    return this.#record(this.memberJoined, room);
  }

  publishGameStarted(room: RoomSnapshotDto): Promise<void> {
    return this.#record(this.gameStarted, room);
  }

  #record(target: RoomSnapshotDto[], room: RoomSnapshotDto): Promise<void> {
    target.push(room);
    return this.#failWith === undefined ? Promise.resolve() : Promise.reject(this.#failWith);
  }
}

const NOW = new Date(ROOM_CREATED_AT.getTime() + HOUR);
const clock = { now: (): Date => NOW };

function joinRoomWith(
  repository: RoomRepository,
  publisher: RoomEventPublisher = new RecordingRoomEventPublisher(),
): JoinRoom {
  return new JoinRoom(repository, sequenceRandom(), clock, publisher);
}

/** 読み直しのたびに、参加で書き換わっていない部屋を返すための部屋の列。 */
function freshRooms(count: number): Room[] {
  return Array.from({ length: count }, () => roomWith(["たろう"]));
}

function startedRoom(): Room {
  const room = roomWith(["たろう", "はなこ"]);
  room.start(room.host.token, ROOM_CREATED_AT, sequenceRandom());
  return room;
}

const originalLogger = getLogger();
let logger: MemoryLogger;

beforeEach(() => {
  logger = new MemoryLogger();
  setLogger(logger);
});

afterEach(() => {
  setLogger(originalLogger);
});

describe("execute", () => {
  describe("入れる部屋のとき", () => {
    it("ニックネームのメンバーを最後に加えた部屋を保存する", async () => {
      const repository = new FakeRoomRepository([roomWith(["たろう"])]);

      const result = await joinRoomWith(repository).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      });

      expect(result.room.code).toEqual(expect.any(String));
      expect(repository.saved).toHaveLength(1);
      expect(repository.saved[0]?.members.map((m) => m.nickname.value)).toEqual([
        "たろう",
        "はなこ",
      ]);
    });

    it("返すプレイヤー識別子とトークンが、加わったメンバーのものになる（ホストのものではない）", async () => {
      const repository = new FakeRoomRepository([roomWith(["たろう"])]);

      const result = await joinRoomWith(repository).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      });

      const saved = repository.saved[0];
      const joined = saved?.members[1];
      expect(result.playerId).toBe(joined?.playerId.value);
      expect(result.playerToken).toBe(joined?.token.value);
      expect(result.playerId).not.toBe(saved?.host.playerId.value);
    });

    it("返す写しが保存した部屋と一致し、トークンを含まない", async () => {
      const repository = new FakeRoomRepository([roomWith(["たろう"])]);

      const result = await joinRoomWith(repository).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      });

      const saved = repository.saved[0];
      expect(result.room).toEqual({
        code: saved?.code.value,
        roundCount: 1,
        hostPlayerId: saved?.host.playerId.value,
        status: "waiting",
        members: saved?.members.map((m) => ({
          playerId: m.playerId.value,
          nickname: m.nickname.value,
        })),
      });
      const serialized = JSON.stringify(result.room);
      for (const member of saved?.members ?? []) {
        expect(serialized).not.toContain(member.token.value);
      }
    });

    it("最後に更新した時刻を、時計の時刻にする", async () => {
      const repository = new FakeRoomRepository([roomWith(["たろう"])]);

      await joinRoomWith(repository).execute({ roomCode: "ABC123", nickname: "はなこ" });

      expect(repository.saved[0]?.lastUpdatedAt).toEqual(NOW);
    });
  });

  it("部屋コードを、大文字小文字・前後の空白をそろえて探す", async () => {
    const repository = new FakeRoomRepository([roomWith(["たろう"])]);

    await joinRoomWith(repository).execute({ roomCode: " abc123 ", nickname: "はなこ" });

    expect(repository.requestedCodes).toEqual(["ABC123"]);
  });

  it("部屋コードの書式が誤りのとき、room_not_found を返して部屋を探さない", async () => {
    const repository = new FakeRoomRepository([roomWith(["たろう"])]);

    await expect(
      joinRoomWith(repository).execute({ roomCode: "ABC", nickname: "はなこ" }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
    expect(repository.requestedCodes).toEqual([]);
  });

  it.each([
    { nickname: "", code: "room.nickname_empty" },
    { nickname: "   ", code: "room.nickname_empty" },
    { nickname: "じゅげむじゅげむごこう", code: "room.nickname_too_long" },
  ])("ニックネーム「$nickname」のとき $code を返して部屋を探さない", async ({ nickname, code }) => {
    const repository = new FakeRoomRepository([roomWith(["たろう"])]);

    await expect(
      joinRoomWith(repository).execute({ roomCode: "ABC123", nickname }),
    ).rejects.toThrow(expect.objectContaining({ code: code }));
    expect(repository.requestedCodes).toEqual([]);
  });

  it("部屋コードとニックネームがどちらも誤りのとき、部屋コードの誤りを返す", async () => {
    const repository = new FakeRoomRepository([roomWith(["たろう"])]);

    await expect(
      joinRoomWith(repository).execute({ roomCode: "ABC", nickname: "" }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
  });

  it("部屋が無いとき、room_not_found を返して保存しない", async () => {
    const repository = new FakeRoomRepository([undefined]);

    await expect(
      joinRoomWith(repository).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
    expect(repository.attempts).toBe(0);
  });

  it("最後の更新から 24 時間たった部屋は room_not_found を返して保存しない", async () => {
    const repository = new FakeRoomRepository([
      roomWith(["たろう"], new Date(NOW.getTime() - 24 * HOUR)),
    ]);

    await expect(
      joinRoomWith(repository).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
    expect(repository.attempts).toBe(0);
  });

  it("24 時間に 1 ミリ秒足りない部屋には入れる", async () => {
    const repository = new FakeRoomRepository([
      roomWith(["たろう"], new Date(NOW.getTime() - 24 * HOUR + 1)),
    ]);

    const result = await joinRoomWith(repository).execute({
      roomCode: "ABC123",
      nickname: "はなこ",
    });

    expect(result.room.code).toEqual(expect.any(String));
  });

  it.each([
    {
      label: "ゲームが始まった部屋",
      room: startedRoom,
      nickname: "じろう",
      code: "room.game_already_started",
    },
    {
      label: "8 人の部屋",
      room: () => roomWith(["a", "b", "c", "d", "e", "f", "g", "h"]),
      nickname: "じろう",
      code: "room.room_full",
    },
    {
      label: "同じニックネームのメンバーがいる部屋",
      room: () => roomWith(["たろう", "はなこ"]),
      nickname: "はなこ",
      code: "room.nickname_taken",
    },
  ])("$label のとき $code を返して保存しない", async ({ room, nickname, code }) => {
    const repository = new FakeRoomRepository([room()]);

    await expect(
      joinRoomWith(repository).execute({ roomCode: "ABC123", nickname }),
    ).rejects.toThrow(expect.objectContaining({ code: code }));
    expect(repository.attempts).toBe(0);
  });

  describe("保存が 1 回衝突したとき", () => {
    it("部屋を読み直し、読み直した部屋に加えて保存する", async () => {
      const first = roomWith(["たろう"]);
      const reread = roomWith(["たろう", "じろう"]);
      const repository = new FakeRoomRepository([first, reread], 1);

      const result = await joinRoomWith(repository).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      });

      expect(result.room.code).toEqual(expect.any(String));
      expect(repository.requestedCodes).toHaveLength(2);
      expect(repository.attempts).toBe(2);
      expect(repository.saved[0]).toBe(reread);
      expect(reread.members.map((m) => m.nickname.value)).toEqual(["たろう", "じろう", "はなこ"]);
    });

    it("読み直した部屋が 8 人になっていたら、room_full を返して保存しない", async () => {
      const seven = roomWith(["a", "b", "c", "d", "e", "f", "g"]);
      const eight = roomWith(["a", "b", "c", "d", "e", "f", "g", "h"]);
      const repository = new FakeRoomRepository([seven, eight], 1);

      await expect(
        joinRoomWith(repository).execute({
          roomCode: "ABC123",
          nickname: "はなこ",
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "room.room_full" }));
      expect(repository.saved).toHaveLength(0);
    });

    it("部屋コードと回数を warn の log に出す", async () => {
      const repository = new FakeRoomRepository(freshRooms(2), 1);

      await joinRoomWith(repository).execute({ roomCode: "ABC123", nickname: "はなこ" });

      const warnings = logger.entries.filter((entry) => entry.level === "warn");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.context).toMatchObject({ roomCode: "ABC123", attempt: 1 });
    });
  });

  describe("衝突が上限まで続いたとき", () => {
    it("error の log を出して throw する", async () => {
      const repository = new FakeRoomRepository(freshRooms(10), 100);

      await expect(
        joinRoomWith(repository).execute({ roomCode: "ABC123", nickname: "はなこ" }),
      ).rejects.toThrow("Could not join the room after repeated save conflicts.");

      const errors = logger.entries.filter((entry) => entry.level === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]?.context).toMatchObject({ roomCode: "ABC123", attempts: 10 });
      expect(JSON.stringify(errors[0]?.context)).not.toContain("はなこ");
    });

    it("保存を 10 回で止める", async () => {
      const repository = new FakeRoomRepository(freshRooms(10), 100);

      await joinRoomWith(repository)
        .execute({ roomCode: "ABC123", nickname: "はなこ" })
        .catch(() => undefined);

      expect(repository.attempts).toBe(10);
    });
  });

  describe("通知", () => {
    it("加わったとき、返す写しと同じ写しでメンバーが加わったことを 1 回知らせる", async () => {
      const publisher = new RecordingRoomEventPublisher();

      const result = await joinRoomWith(
        new FakeRoomRepository([roomWith(["たろう"])]),
        publisher,
      ).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      });

      expect(publisher.memberJoined).toHaveLength(1);
      expect(publisher.memberJoined[0]).toBe(result.room);
      expect(publisher.gameStarted).toHaveLength(0);
    });

    it.each([
      {
        label: "満員",
        room: () => roomWith(["a", "b", "c", "d", "e", "f", "g", "h"]),
        nickname: "はなこ",
      },
      { label: "ゲーム中", room: startedRoom, nickname: "じろう" },
      { label: "名前の重複", room: () => roomWith(["たろう"]), nickname: "たろう" },
      { label: "部屋が無い", room: () => undefined, nickname: "はなこ" },
    ])("入れなかったとき（$label）、知らせない", async ({ room, nickname }) => {
      const publisher = new RecordingRoomEventPublisher();

      await expect(
        joinRoomWith(new FakeRoomRepository([room()]), publisher).execute({
          roomCode: "ABC123",
          nickname,
        }),
      ).rejects.toThrow(RoomError);
      expect(publisher.memberJoined).toHaveLength(0);
    });

    it("保存が 1 回衝突して読み直したとき、知らせるのは保存できた後の 1 回だけ", async () => {
      const publisher = new RecordingRoomEventPublisher();

      await joinRoomWith(new FakeRoomRepository(freshRooms(2), 1), publisher).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      });

      expect(publisher.memberJoined).toHaveLength(1);
    });

    it("知らせるのに失敗しても、加わった結果を返し、部屋コード付きの warn の log を出す", async () => {
      const publisher = new RecordingRoomEventPublisher(new Error("送れない"));

      const result = await joinRoomWith(
        new FakeRoomRepository([roomWith(["たろう"])]),
        publisher,
      ).execute({
        roomCode: "ABC123",
        nickname: "はなこ",
      });

      expect(result.room.code).toEqual(expect.any(String));
      const warnings = logger.entries.filter((entry) => entry.level === "warn");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.context).toMatchObject({ roomCode: "ABC123" });
    });
  });
});
