import type { Result } from "@eshiritori/shared-kernel";
import { failure, getLogger, MemoryLogger, setLogger, success } from "@eshiritori/shared-kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fixedRandom, ROOM_CREATED_AT, roomWith } from "../../fixtures/roomFixtures";
import type { RandomSource } from "../domain/random/RandomSource";
import type { Room } from "../domain/room/Room";
import type { RoomCode } from "../domain/room/RoomCode";
import type { RoomRepository, RoomSaveConflict } from "../domain/room/RoomRepository";
import { RoomError } from "../errors/RoomError";
import type { RoomEventPublisher } from "./RoomEventPublisher";
import type { RoomSnapshotDto } from "./RoomSnapshotDto";
import { StartGame } from "./StartGame";

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

const HOUR = 60 * 60 * 1000;
const NOW = new Date(ROOM_CREATED_AT.getTime() + HOUR);
const clock = { now: (): Date => NOW };

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

/** ホストのトークンは roomWith が毎回同じ値で作る。 */
const HOST_TOKEN = roomWith(["たろう"]).host.token.value;

function startGameWith(
  repository: RoomRepository,
  random: RandomSource,
  publisher: RoomEventPublisher = new RecordingRoomEventPublisher(),
): StartGame {
  return new StartGame(repository, random, clock, publisher);
}

function startedRoom(nicknames: readonly string[]): Room {
  const room = roomWith(nicknames);
  room.start(room.host.token, ROOM_CREATED_AT, fixedRandom([0, 0, 0, 0]));
  return room;
}

function freshRooms(count: number): Room[] {
  return Array.from({ length: count }, () => roomWith(["たろう", "はなこ"]));
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
  describe("ホストのトークンで、2 人以上の待機中の部屋を始めるとき", () => {
    it("ゲームが始まった部屋を、メンバーを乱数で並べ替えた並びで保存する", async () => {
      const repository = new FakeRoomRepository([roomWith(["たろう", "はなこ", "じろう"])]);

      const result = await startGameWith(repository, fixedRandom([2, 0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      expect(result.room.code).toEqual(expect.any(String));
      expect(repository.saved).toHaveLength(1);
      expect(repository.saved[0]?.status.hasStarted()).toBe(true);
      expect(repository.saved[0]?.members.map((m) => m.nickname.value)).toEqual([
        "じろう",
        "たろう",
        "はなこ",
      ]);
    });

    it("返す写しの進行状態が started で、並びが保存した部屋と一致し、トークンを含まない", async () => {
      const repository = new FakeRoomRepository([roomWith(["たろう", "はなこ", "じろう"])]);

      const result = await startGameWith(repository, fixedRandom([2, 0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      const saved = repository.saved[0];
      expect(result.room).toEqual({
        code: saved?.code.value,
        roundCount: 1,
        hostPlayerId: saved?.host.playerId.value,
        status: "started",
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
      const repository = new FakeRoomRepository([roomWith(["たろう", "はなこ"])]);

      await startGameWith(repository, fixedRandom([0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      expect(repository.saved[0]?.lastUpdatedAt).toEqual(NOW);
    });
  });

  it("部屋コードを、大文字小文字・前後の空白をそろえて探す", async () => {
    const repository = new FakeRoomRepository([roomWith(["たろう", "はなこ"])]);

    await startGameWith(repository, fixedRandom([0])).execute({
      roomCode: " abc123 ",
      playerToken: HOST_TOKEN,
    });

    expect(repository.requestedCodes).toEqual(["ABC123"]);
  });

  it("部屋コードの書式が誤りのとき、room_not_found を返して部屋を探さない", async () => {
    const repository = new FakeRoomRepository([roomWith(["たろう", "はなこ"])]);

    await expect(
      startGameWith(repository, fixedRandom([0])).execute({
        roomCode: "ABC",
        playerToken: HOST_TOKEN,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
    expect(repository.requestedCodes).toEqual([]);
  });

  it("部屋が無いとき、room_not_found を返して保存しない", async () => {
    const repository = new FakeRoomRepository([undefined]);

    await expect(
      startGameWith(repository, fixedRandom([0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
    expect(repository.attempts).toBe(0);
  });

  it("最後の更新から 24 時間たった部屋は room_not_found を返して保存しない", async () => {
    const repository = new FakeRoomRepository([
      roomWith(["たろう", "はなこ"], new Date(NOW.getTime() - 24 * HOUR)),
    ]);

    await expect(
      startGameWith(repository, fixedRandom([0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
    expect(repository.attempts).toBe(0);
  });

  it("24 時間に 1 ミリ秒足りない部屋は始められる", async () => {
    const repository = new FakeRoomRepository([
      roomWith(["たろう", "はなこ"], new Date(NOW.getTime() - 24 * HOUR + 1)),
    ]);

    const result = await startGameWith(repository, fixedRandom([0])).execute({
      roomCode: "ABC123",
      playerToken: HOST_TOKEN,
    });

    expect(result.room.code).toEqual(expect.any(String));
  });

  it.each([HOST_TOKEN, "ホストでないトークン"])(
    "期限切れの部屋には、トークンが「%s」でも room_not_found を返す",
    async (playerToken) => {
      const repository = new FakeRoomRepository([
        roomWith(["たろう", "はなこ"], new Date(NOW.getTime() - 24 * HOUR)),
      ]);

      await expect(
        startGameWith(repository, fixedRandom([0])).execute({
          roomCode: "ABC123",
          playerToken,
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
    },
  );

  it.each([
    {
      label: "ホストでないメンバーのトークン",
      token: (room: Room) => room.members[1]?.token.value,
    },
    { label: "どのメンバーのものでもないトークン", token: () => "someone-else" },
    { label: "空のトークン", token: () => "" },
  ])("$label のとき not_host を返して保存しない", async ({ token }) => {
    const room = roomWith(["たろう", "はなこ"]);
    const repository = new FakeRoomRepository([room]);

    await expect(
      startGameWith(repository, fixedRandom([0])).execute({
        roomCode: "ABC123",
        playerToken: token(room) ?? "",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.not_host" }));
    expect(repository.attempts).toBe(0);
  });

  it("メンバーがホスト 1 人だけのとき、not_enough_members を返して保存しない", async () => {
    const repository = new FakeRoomRepository([roomWith(["たろう"])]);

    await expect(
      startGameWith(repository, fixedRandom([])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.not_enough_members" }));
    expect(repository.attempts).toBe(0);
  });

  describe("既に始まった部屋のとき", () => {
    it("保存しない（最後に更新した時刻も進めない）", async () => {
      const room = startedRoom(["たろう", "はなこ"]);
      const repository = new FakeRoomRepository([room]);

      const result = await startGameWith(repository, fixedRandom([])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      expect(result.room.code).toEqual(expect.any(String));
      expect(repository.attempts).toBe(0);
      expect(room.lastUpdatedAt).toEqual(ROOM_CREATED_AT);
    });

    it("部屋の並びのまま、進行状態 started の写しを返す", async () => {
      const room = startedRoom(["たろう", "はなこ", "じろう"]);
      const repository = new FakeRoomRepository([room]);

      const result = await startGameWith(repository, fixedRandom([])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      expect(result.room.status).toBe("started");
      expect(result.room.members.map((m) => m.nickname)).toEqual(
        room.members.map((m) => m.nickname.value),
      );
    });

    it("ホストでないメンバーのトークンなら not_host を返す", async () => {
      const room = startedRoom(["たろう", "はなこ"]);
      const repository = new FakeRoomRepository([room]);

      await expect(
        startGameWith(repository, fixedRandom([])).execute({
          roomCode: "ABC123",
          playerToken: room.members.find((m) => m.token.value !== HOST_TOKEN)?.token.value ?? "",
        }),
      ).rejects.toThrow(expect.objectContaining({ code: "room.not_host" }));
    });
  });

  describe("保存が 1 回衝突したとき", () => {
    it("部屋を読み直し、読み直した部屋で始めて保存する", async () => {
      const first = roomWith(["たろう", "はなこ"]);
      const reread = roomWith(["たろう", "はなこ", "じろう"]);
      const repository = new FakeRoomRepository([first, reread], 1);

      const result = await startGameWith(repository, fixedRandom([0, 0, 0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      expect(result.room.code).toEqual(expect.any(String));
      expect(repository.requestedCodes).toHaveLength(2);
      expect(repository.attempts).toBe(2);
      expect(repository.saved[0]).toBe(reread);
    });

    it("読み直した部屋が既に始まっていたら、保存せずに読み直した部屋の並びの写しを返す", async () => {
      const first = roomWith(["たろう", "はなこ", "じろう"]);
      const reread = startedRoom(["たろう", "はなこ", "じろう"]);
      const repository = new FakeRoomRepository([first, reread], 1);

      const result = await startGameWith(repository, fixedRandom([0, 0, 0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      expect(repository.saved).toHaveLength(0);
      expect(result.room.members.map((m) => m.nickname)).toEqual(
        reread.members.map((m) => m.nickname.value),
      );
    });

    it("部屋コードと回数を warn の log に出す", async () => {
      const repository = new FakeRoomRepository(freshRooms(2), 1);

      await startGameWith(repository, fixedRandom([0, 0])).execute({
        roomCode: "ABC123",
        playerToken: HOST_TOKEN,
      });

      const warnings = logger.entries.filter((entry) => entry.level === "warn");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.context).toMatchObject({ roomCode: "ABC123", attempt: 1 });
    });
  });

  describe("衝突が上限まで続いたとき", () => {
    it("error の log を出して throw する", async () => {
      const repository = new FakeRoomRepository(freshRooms(10), 100);

      await expect(
        startGameWith(repository, fixedRandom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).execute({
          roomCode: "ABC123",
          playerToken: HOST_TOKEN,
        }),
      ).rejects.toThrow("Could not start the game after repeated save conflicts.");

      const errors = logger.entries.filter((entry) => entry.level === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]?.context).toMatchObject({ roomCode: "ABC123", attempts: 10 });
      expect(JSON.stringify(errors[0]?.context)).not.toContain(HOST_TOKEN);
    });

    it("保存を 10 回で止める", async () => {
      const repository = new FakeRoomRepository(freshRooms(10), 100);

      await startGameWith(repository, fixedRandom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
        .execute({ roomCode: "ABC123", playerToken: HOST_TOKEN })
        .catch(() => undefined);

      expect(repository.attempts).toBe(10);
    });
  });

  describe("通知", () => {
    it("始まったとき、返す写し（描く順番）と同じ写しでゲームが始まったことを 1 回知らせる", async () => {
      const publisher = new RecordingRoomEventPublisher();

      const result = await startGameWith(
        new FakeRoomRepository([roomWith(["たろう", "はなこ", "じろう"])]),
        fixedRandom([2, 0]),
        publisher,
      ).execute({ roomCode: "ABC123", playerToken: HOST_TOKEN });

      expect(publisher.gameStarted).toHaveLength(1);
      expect(publisher.gameStarted[0]).toBe(result.room);
      expect(publisher.gameStarted[0]?.status).toBe("started");
      expect(publisher.memberJoined).toHaveLength(0);
    });

    it("既に始まっていたとき、知らせない", async () => {
      const publisher = new RecordingRoomEventPublisher();

      await startGameWith(
        new FakeRoomRepository([startedRoom(["たろう", "はなこ"])]),
        fixedRandom([]),
        publisher,
      ).execute({ roomCode: "ABC123", playerToken: HOST_TOKEN });

      expect(publisher.gameStarted).toHaveLength(0);
    });

    it.each([
      { label: "ホストでない", room: () => roomWith(["たろう", "はなこ"]), token: "someone-else" },
      { label: "人数が足りない", room: () => roomWith(["たろう"]), token: HOST_TOKEN },
    ])("$label とき、知らせない", async ({ room, token }) => {
      const publisher = new RecordingRoomEventPublisher();

      await expect(
        startGameWith(new FakeRoomRepository([room()]), fixedRandom([0]), publisher).execute({
          roomCode: "ABC123",
          playerToken: token,
        }),
      ).rejects.toThrow(RoomError);
      expect(publisher.gameStarted).toHaveLength(0);
    });

    it("知らせるのに失敗しても、始まった結果を返し、部屋コード付きの warn の log を出す", async () => {
      const publisher = new RecordingRoomEventPublisher(new Error("送れない"));

      const result = await startGameWith(
        new FakeRoomRepository([roomWith(["たろう", "はなこ"])]),
        fixedRandom([0]),
        publisher,
      ).execute({ roomCode: "ABC123", playerToken: HOST_TOKEN });

      expect(result.room.code).toEqual(expect.any(String));
      const warnings = logger.entries.filter((entry) => entry.level === "warn");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.context).toMatchObject({ roomCode: "ABC123" });
    });
  });
});
