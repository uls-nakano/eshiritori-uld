import type { Result } from "@eshiritori/shared-kernel";
import { getLogger, MemoryLogger, setLogger } from "@eshiritori/shared-kernel";
import { describe, expect, it } from "vitest";

import { ROOM_CREATED_AT, roomWith } from "../../fixtures/roomFixtures";
import type { Room } from "../domain/room/Room";
import type { RoomCode } from "../domain/room/RoomCode";
import type { RoomRepository, RoomSaveConflict } from "../domain/room/RoomRepository";
import { GetRoom } from "./GetRoom";

const HOUR = 60 * 60 * 1000;
const NOW = new Date(ROOM_CREATED_AT.getTime() + HOUR);
const clock = { now: (): Date => NOW };

/** 1 つの部屋（または無し）を返し、受け取った部屋コードを記録する fake。保存されたら throw する。 */
class FakeRoomRepository implements RoomRepository {
  readonly requestedCodes: string[] = [];
  readonly #room: Room | undefined;

  constructor(room: Room | undefined) {
    this.#room = room;
  }

  findByCode(code: RoomCode): Promise<Room | undefined> {
    this.requestedCodes.push(code.value);
    return Promise.resolve(this.#room);
  }

  save(): Promise<Result<void, RoomSaveConflict>> {
    throw new Error("GetRoom must not save.");
  }
}

function getRoomWith(room: Room | undefined): { useCase: GetRoom; repository: FakeRoomRepository } {
  const repository = new FakeRoomRepository(room);
  return { useCase: new GetRoom(repository, clock), repository };
}

describe("execute", () => {
  it.each([0, 1])(
    "メンバーのトークンのとき、部屋の写しとそのメンバーのプレイヤー識別子を返す（%i 番目のメンバー）",
    async (index) => {
      const room = roomWith(["たろう", "はなこ"]);
      const member = room.members[index];

      const { useCase } = getRoomWith(room);
      const result = await useCase.execute({
        roomCode: "ABC123",
        playerToken: member?.token.value ?? "",
      });

      expect(result.playerId).toBe(member?.playerId.value);
      expect(result.room).toEqual({
        code: room.code.value,
        roundCount: 1,
        hostPlayerId: room.host.playerId.value,
        members: room.members.map((m) => ({
          playerId: m.playerId.value,
          nickname: m.nickname.value,
        })),
      });
    },
  );

  it("返す写しにトークンを含めない", async () => {
    const room = roomWith(["たろう", "はなこ"]);

    const { useCase } = getRoomWith(room);
    const result = await useCase.execute({
      roomCode: "ABC123",
      playerToken: room.host.token.value,
    });

    const serialized = JSON.stringify(result);
    for (const member of room.members) {
      expect(serialized).not.toContain(member.token.value);
    }
  });

  it("部屋コードを、大文字小文字をそろえて探す", async () => {
    const room = roomWith(["たろう"]);

    const { useCase, repository } = getRoomWith(room);
    await useCase.execute({ roomCode: " abc123 ", playerToken: room.host.token.value });

    expect(repository.requestedCodes).toEqual(["ABC123"]);
  });

  it.each([
    {
      label: "部屋コードの書式が誤り",
      roomCode: "ABC",
      room: (): Room | undefined => roomWith(["たろう"]),
    },
    { label: "部屋が無い", roomCode: "ABC123", room: (): Room | undefined => undefined },
    {
      label: "最後の更新から 24 時間たった",
      roomCode: "ABC123",
      room: (): Room | undefined => roomWith(["たろう"], new Date(NOW.getTime() - 24 * HOUR)),
    },
  ])("$label とき room_not_found を返す", async ({ roomCode, room }) => {
    const { useCase } = getRoomWith(room());

    await expect(useCase.execute({ roomCode, playerToken: "x" })).rejects.toThrow(
      expect.objectContaining({ code: "room.room_not_found" }),
    );
  });

  it("24 時間に 1 ミリ秒足りない部屋は取れる", async () => {
    const room = roomWith(["たろう"], new Date(NOW.getTime() - 24 * HOUR + 1));

    const { useCase } = getRoomWith(room);
    const result = await useCase.execute({
      roomCode: "ABC123",
      playerToken: room.host.token.value,
    });

    expect(result.room.code).toEqual(expect.any(String));
  });

  it.each(["どのメンバーのものでもないトークン", ""])(
    "トークンが「%s」のとき not_member を返す",
    async (playerToken) => {
      const { useCase } = getRoomWith(roomWith(["たろう"]));

      await expect(useCase.execute({ roomCode: "ABC123", playerToken })).rejects.toThrow(
        expect.objectContaining({ code: "room.not_member" }),
      );
    },
  );

  it("not_member を返す前に、部屋コードだけを error のログに出し、トークンは出さない", async () => {
    const original = getLogger();
    const logger = new MemoryLogger();
    setLogger(logger);
    try {
      const { useCase } = getRoomWith(roomWith(["たろう"]));

      await expect(
        useCase.execute({ roomCode: "ABC123", playerToken: "secret-token-value" }),
      ).rejects.toThrow(expect.objectContaining({ code: "room.not_member" }));

      expect(logger.entries).toEqual([
        {
          level: "error",
          message: "部屋のメンバーでない人が部屋の状態を取ろうとしました",
          context: { roomCode: "ABC123" },
        },
      ]);
      expect(JSON.stringify(logger.entries)).not.toContain("secret-token-value");
    } finally {
      setLogger(original);
    }
  });

  it("期限切れの部屋には、メンバーのトークンでも room_not_found を返す", async () => {
    const room = roomWith(["たろう"], new Date(NOW.getTime() - 24 * HOUR));

    const { useCase } = getRoomWith(room);
    await expect(
      useCase.execute({
        roomCode: "ABC123",
        playerToken: room.host.token.value,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "room.room_not_found" }));
  });
});
