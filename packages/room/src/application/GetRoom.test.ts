import type { Result } from "@eshiritori/shared-kernel";
import { isFailure, isSuccess } from "@eshiritori/shared-kernel";
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

      expect(isSuccess(result) && result.value.playerId).toBe(member?.playerId.value);
      expect(isSuccess(result) && result.value.room).toEqual({
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

    const serialized = JSON.stringify(isSuccess(result) && result.value);
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

    const result = await useCase.execute({ roomCode, playerToken: "x" });

    expect(isFailure(result) && result.error.code).toBe("room.room_not_found");
  });

  it("24 時間に 1 ミリ秒足りない部屋は取れる", async () => {
    const room = roomWith(["たろう"], new Date(NOW.getTime() - 24 * HOUR + 1));

    const { useCase } = getRoomWith(room);
    const result = await useCase.execute({
      roomCode: "ABC123",
      playerToken: room.host.token.value,
    });

    expect(isSuccess(result)).toBe(true);
  });

  it.each(["どのメンバーのものでもないトークン", ""])(
    "トークンが「%s」のとき not_member を返す",
    async (playerToken) => {
      const { useCase } = getRoomWith(roomWith(["たろう"]));

      const result = await useCase.execute({ roomCode: "ABC123", playerToken });

      expect(isFailure(result) && result.error.code).toBe("room.not_member");
    },
  );

  it("期限切れの部屋には、メンバーのトークンでも room_not_found を返す", async () => {
    const room = roomWith(["たろう"], new Date(NOW.getTime() - 24 * HOUR));

    const { useCase } = getRoomWith(room);
    const result = await useCase.execute({
      roomCode: "ABC123",
      playerToken: room.host.token.value,
    });

    expect(isFailure(result) && result.error.code).toBe("room.room_not_found");
  });
});
