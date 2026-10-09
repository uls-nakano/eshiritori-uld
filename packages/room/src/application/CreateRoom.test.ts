import type { Result } from "@eshiritori/shared-kernel";
import { failure, getLogger, MemoryLogger, setLogger, success } from "@eshiritori/shared-kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ROOM_CREATED_AT, sequenceRandom } from "../../fixtures/roomFixtures";
import type { Room } from "../domain/room/Room";
import type { RoomRepository, RoomSaveConflict } from "../domain/room/RoomRepository";
import { CreateRoom } from "./CreateRoom";

/** 保存した部屋を記録し、最初の conflicts 回だけ save_conflict を返す fake。 */
class FakeRoomRepository implements RoomRepository {
  readonly saved: Room[] = [];
  attempts = 0;
  readonly #conflicts: number;

  constructor(conflicts = 0) {
    this.#conflicts = conflicts;
  }

  findByCode(): Promise<Room | undefined> {
    throw new Error("findByCode is not used by CreateRoom.");
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

const clock = { now: (): Date => ROOM_CREATED_AT };

function createRoomWith(repository: RoomRepository): CreateRoom {
  return new CreateRoom(repository, sequenceRandom(), clock);
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
  it("有効なニックネームと周回数のとき、作った人だけがメンバーにいて、その人がホストの部屋を保存する", async () => {
    const repository = new FakeRoomRepository();

    const result = await createRoomWith(repository).execute({ nickname: "たろう", roundCount: 3 });

    expect(result.playerId).toEqual(expect.any(String));
    const [room] = repository.saved;
    expect(repository.saved).toHaveLength(1);
    expect(room?.members).toHaveLength(1);
    expect(room?.host.nickname.value).toBe("たろう");
    expect(room?.roundCount.value).toBe(3);
  });

  it("返す写しの部屋コード・周回数・ホスト・メンバー一覧が、保存した部屋と一致する", async () => {
    const repository = new FakeRoomRepository();

    const result = await createRoomWith(repository).execute({ nickname: "たろう", roundCount: 3 });

    const room = repository.saved[0];
    expect(result.room).toEqual({
      code: room?.code.value,
      roundCount: 3,
      hostPlayerId: room?.host.playerId.value,
      status: "waiting",
      members: [{ playerId: room?.host.playerId.value, nickname: "たろう" }],
    });
  });

  it("返すプレイヤー識別子とプレイヤートークンが、保存した部屋のホストのものになる", async () => {
    const repository = new FakeRoomRepository();

    const result = await createRoomWith(repository).execute({ nickname: "たろう", roundCount: 1 });

    const room = repository.saved[0];
    expect(result.playerId).toBe(room?.host.playerId.value);
    expect(result.playerToken).toBe(room?.host.token.value);
  });

  it("前後の空白を除いたニックネームで作る", async () => {
    const repository = new FakeRoomRepository();

    await createRoomWith(repository).execute({ nickname: "  たろう　", roundCount: 1 });

    expect(repository.saved[0]?.host.nickname.value).toBe("たろう");
  });

  it("部屋の写しにトークンを含めない", async () => {
    const repository = new FakeRoomRepository();

    const result = await createRoomWith(repository).execute({ nickname: "たろう", roundCount: 1 });

    const token = repository.saved[0]?.host.token.value ?? "";
    expect(token).not.toBe("");
    expect(JSON.stringify(result.room)).not.toContain(token);
  });

  it("最後に更新した時刻を時計の時刻にする", async () => {
    const repository = new FakeRoomRepository();

    await createRoomWith(repository).execute({ nickname: "たろう", roundCount: 1 });

    expect(repository.saved[0]?.lastUpdatedAt).toEqual(ROOM_CREATED_AT);
  });

  it.each([1, 5])("周回数の境界の %i で作れる", async (roundCount) => {
    const repository = new FakeRoomRepository();

    const result = await createRoomWith(repository).execute({ nickname: "たろう", roundCount });

    expect(result.playerId).toEqual(expect.any(String));
  });

  it.each([
    { nickname: "", code: "room.nickname_empty" },
    { nickname: "   ", code: "room.nickname_empty" },
    { nickname: "じゅげむじゅげむごこう", code: "room.nickname_too_long" },
  ])("ニックネーム「$nickname」のとき $code を返して保存しない", async ({ nickname, code }) => {
    const repository = new FakeRoomRepository();

    await expect(createRoomWith(repository).execute({ nickname, roundCount: 1 })).rejects.toThrow(
      expect.objectContaining({ code: code }),
    );
    expect(repository.attempts).toBe(0);
  });

  it.each([0, 6, 2.5])(
    "周回数が %s のとき round_count_out_of_range を返して保存しない",
    async (roundCount) => {
      const repository = new FakeRoomRepository();

      await expect(
        createRoomWith(repository).execute({ nickname: "たろう", roundCount }),
      ).rejects.toThrow(expect.objectContaining({ code: "room.round_count_out_of_range" }));
      expect(repository.attempts).toBe(0);
    },
  );

  it("ニックネームと周回数がどちらも誤りのとき、ニックネームの誤りを返す", async () => {
    const repository = new FakeRoomRepository();

    await expect(
      createRoomWith(repository).execute({ nickname: "", roundCount: 0 }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.nickname_empty" }));
  });

  describe("保存が 1 回衝突したとき", () => {
    it("別の部屋コードの部屋を作り直して保存し、それを返す", async () => {
      const repository = new FakeRoomRepository(1);

      const result = await createRoomWith(repository).execute({
        nickname: "たろう",
        roundCount: 1,
      });

      expect(repository.attempts).toBe(2);
      expect(repository.saved).toHaveLength(1);
      expect(result.room.code).toBe(repository.saved[0]?.code.value);
    });

    it("重なった部屋コードを warn の log に出す", async () => {
      const repository = new FakeRoomRepository(1);

      await createRoomWith(repository).execute({ nickname: "たろう", roundCount: 1 });

      const warnings = logger.entries.filter((entry) => entry.level === "warn");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.context).toMatchObject({ attempt: 1 });
      expect(warnings[0]?.context?.["roomCode"]).toEqual(expect.any(String));
    });
  });

  describe("3 回続けて衝突したとき", () => {
    it("error の log を出して throw する", async () => {
      const repository = new FakeRoomRepository(3);

      await expect(
        createRoomWith(repository).execute({ nickname: "たろう", roundCount: 1 }),
      ).rejects.toThrow("Could not allocate a unique room code.");

      const errors = logger.entries.filter((entry) => entry.level === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]?.context).toMatchObject({ attempts: 3 });
    });

    it("保存を 3 回で止める", async () => {
      const repository = new FakeRoomRepository(10);

      await createRoomWith(repository)
        .execute({ nickname: "たろう", roundCount: 1 })
        .catch(() => undefined);

      expect(repository.attempts).toBe(3);
    });
  });
});
