import type { Result } from "@eshiritori/shared-kernel";
import {
  failure,
  getLogger,
  isFailure,
  isSuccess,
  MemoryLogger,
  setLogger,
  success,
} from "@eshiritori/shared-kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fixedRandom, ROOM_CREATED_AT, roomWith } from "../../fixtures/roomFixtures";
import type { RandomSource } from "../domain/random/RandomSource";
import type { Room } from "../domain/room/Room";
import type { RoomCode } from "../domain/room/RoomCode";
import type { RoomRepository, RoomSaveConflict } from "../domain/room/RoomRepository";
import { StartGame } from "./StartGame";

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

function startGameWith(repository: RoomRepository, random: RandomSource): StartGame {
  return new StartGame(repository, random, clock);
}

function startedRoom(nicknames: readonly string[]): Room {
  const room = roomWith(nicknames);
  const started = room.start(room.host.token, ROOM_CREATED_AT, fixedRandom([0, 0, 0, 0]));
  if (!isSuccess(started)) {
    throw new Error("Fixture start failed.");
  }
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

      expect(isSuccess(result)).toBe(true);
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
      expect(isSuccess(result) && result.value.room).toEqual({
        code: saved?.code.value,
        roundCount: 1,
        hostPlayerId: saved?.host.playerId.value,
        status: "started",
        members: saved?.members.map((m) => ({
          playerId: m.playerId.value,
          nickname: m.nickname.value,
        })),
      });
      const serialized = JSON.stringify(isSuccess(result) && result.value.room);
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

    const result = await startGameWith(repository, fixedRandom([0])).execute({
      roomCode: "ABC",
      playerToken: HOST_TOKEN,
    });

    expect(isFailure(result) && result.error.code).toBe("room.room_not_found");
    expect(repository.requestedCodes).toEqual([]);
  });

  it("部屋が無いとき、room_not_found を返して保存しない", async () => {
    const repository = new FakeRoomRepository([undefined]);

    const result = await startGameWith(repository, fixedRandom([0])).execute({
      roomCode: "ABC123",
      playerToken: HOST_TOKEN,
    });

    expect(isFailure(result) && result.error.code).toBe("room.room_not_found");
    expect(repository.attempts).toBe(0);
  });

  it("最後の更新から 24 時間たった部屋は room_not_found を返して保存しない", async () => {
    const repository = new FakeRoomRepository([
      roomWith(["たろう", "はなこ"], new Date(NOW.getTime() - 24 * HOUR)),
    ]);

    const result = await startGameWith(repository, fixedRandom([0])).execute({
      roomCode: "ABC123",
      playerToken: HOST_TOKEN,
    });

    expect(isFailure(result) && result.error.code).toBe("room.room_not_found");
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

    expect(isSuccess(result)).toBe(true);
  });

  it.each([HOST_TOKEN, "ホストでないトークン"])(
    "期限切れの部屋には、トークンが「%s」でも room_not_found を返す",
    async (playerToken) => {
      const repository = new FakeRoomRepository([
        roomWith(["たろう", "はなこ"], new Date(NOW.getTime() - 24 * HOUR)),
      ]);

      const result = await startGameWith(repository, fixedRandom([0])).execute({
        roomCode: "ABC123",
        playerToken,
      });

      expect(isFailure(result) && result.error.code).toBe("room.room_not_found");
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

    const result = await startGameWith(repository, fixedRandom([0])).execute({
      roomCode: "ABC123",
      playerToken: token(room) ?? "",
    });

    expect(isFailure(result) && result.error.code).toBe("room.not_host");
    expect(repository.attempts).toBe(0);
  });

  it("メンバーがホスト 1 人だけのとき、not_enough_members を返して保存しない", async () => {
    const repository = new FakeRoomRepository([roomWith(["たろう"])]);

    const result = await startGameWith(repository, fixedRandom([])).execute({
      roomCode: "ABC123",
      playerToken: HOST_TOKEN,
    });

    expect(isFailure(result) && result.error.code).toBe("room.not_enough_members");
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

      expect(isSuccess(result)).toBe(true);
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

      expect(isSuccess(result) && result.value.room.status).toBe("started");
      expect(isSuccess(result) && result.value.room.members.map((m) => m.nickname)).toEqual(
        room.members.map((m) => m.nickname.value),
      );
    });

    it("ホストでないメンバーのトークンなら not_host を返す", async () => {
      const room = startedRoom(["たろう", "はなこ"]);
      const repository = new FakeRoomRepository([room]);

      const result = await startGameWith(repository, fixedRandom([])).execute({
        roomCode: "ABC123",
        playerToken: room.members.find((m) => m.token.value !== HOST_TOKEN)?.token.value ?? "",
      });

      expect(isFailure(result) && result.error.code).toBe("room.not_host");
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

      expect(isSuccess(result)).toBe(true);
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
      expect(isSuccess(result) && result.value.room.members.map((m) => m.nickname)).toEqual(
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
});
