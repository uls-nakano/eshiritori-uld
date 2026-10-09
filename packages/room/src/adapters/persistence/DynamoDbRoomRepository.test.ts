import {
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { isFailure, isSuccess } from "@eshiritori/shared-kernel";
import { beforeAll, describe, expect, it } from "vitest";

import { nicknameOf, ROOM_CREATED_AT, roundCountOf } from "../../../fixtures/roomFixtures";
import { Member } from "../../domain/room/Member";
import { Revision } from "../../domain/room/Revision";
import { Room } from "../../domain/room/Room";
import { RoomStatus } from "../../domain/room/RoomStatus";
import { CryptoRandomSource } from "../random/CryptoRandomSource";
import { DynamoDbRoomRepository } from "./DynamoDbRoomRepository";
import { roomTable } from "./roomTable";

const random = new CryptoRandomSource();
const dynamoClient = new DynamoDBClient({
  endpoint: process.env["DYNAMODB_ENDPOINT"] ?? "http://localhost:8000",
  region: "ap-northeast-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const client = DynamoDBDocumentClient.from(dynamoClient);
const repository = new DynamoDbRoomRepository(client, roomTable.name);

beforeAll(async () => {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: roomTable.name }));
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    throw new Error(
      `DynamoDB Local に接続できないか、部屋の表がありません。\`npm run db:up\` を実行してください（${name}）`,
      { cause: error },
    );
  }
});

/** 毎回新しい部屋コードの部屋を作る。 */
function newRoom(names: readonly string[] = ["あや"]): Room {
  const [first, ...rest] = names;
  const room = Room.create(nicknameOf(first ?? "あや"), roundCountOf(1), ROOM_CREATED_AT, random);
  for (const name of rest) {
    const joined = room.join(nicknameOf(name), ROOM_CREATED_AT, random);
    if (!isSuccess(joined)) {
      throw new Error(`failed to join: ${name}`);
    }
  }
  return room;
}

async function mustFind(room: Room): Promise<Room> {
  const found = await repository.findByCode(room.code);
  if (found === undefined) {
    throw new Error("room not found");
  }
  return found;
}

/** 保存済みの部屋コードに、別のホストと指定の改訂番号の部屋を作る。 */
function restoredWith(base: Room, revision: Revision, lastUpdatedAt = ROOM_CREATED_AT): Room {
  const host = Member.create(nicknameOf("べつ"), random);
  return Room.restore({
    code: base.code,
    members: [host],
    hostPlayerId: host.playerId,
    roundCount: roundCountOf(1),
    status: RoomStatus.waiting(),
    lastUpdatedAt,
    revision,
  });
}

describe("save", () => {
  it("新しい部屋を保存すると、部屋コードで読み出せ、改訂番号が 1 になる", async () => {
    const room = newRoom(["あや", "いけ"]);
    expect(isSuccess(await repository.save(room))).toBe(true);
    const found = await mustFind(room);
    expect(found.revision.value).toBe(1);
    expect(found.members.map((m) => m.nickname.value)).toEqual(["あや", "いけ"]);
  });

  it("同じ部屋コードの部屋が既にあると、新しい部屋の保存は衝突を返し、既にある部屋は変わらない", async () => {
    const room = newRoom();
    await repository.save(room);
    const result = await repository.save(restoredWith(room, Revision.initial()));
    expect(isFailure(result) && result.error).toBe("save_conflict");
    const found = await mustFind(room);
    expect(found.host.nickname.value).toBe("あや");
  });

  it("読み出した部屋にメンバーを加えて保存すると、加わったメンバーと進んだ改訂番号で読み出せる", async () => {
    const room = newRoom();
    await repository.save(room);
    const read = await mustFind(room);
    read.join(nicknameOf("いけ"), ROOM_CREATED_AT, random);
    expect(isSuccess(await repository.save(read))).toBe(true);
    const found = await mustFind(room);
    expect(found.revision.value).toBe(2);
    expect(found.members.map((m) => m.nickname.value)).toEqual(["あや", "いけ"]);
  });

  it("同じ改訂番号で読んだ 2 つの部屋に別々の人が入ると、先に保存した方だけが書き込まれる", async () => {
    const room = newRoom();
    await repository.save(room);
    const first = await mustFind(room);
    const second = await mustFind(room);
    first.join(nicknameOf("いけ"), ROOM_CREATED_AT, random);
    second.join(nicknameOf("うみ"), ROOM_CREATED_AT, random);
    expect(isSuccess(await repository.save(first))).toBe(true);
    const result = await repository.save(second);
    expect(isFailure(result) && result.error).toBe("save_conflict");
    const found = await mustFind(room);
    expect(found.members.map((m) => m.nickname.value)).toEqual(["あや", "いけ"]);
  });

  it("7 人の部屋に 2 人がほぼ同時に入ると、後の保存は衝突し、読み直した部屋への参加は満員で拒否される", async () => {
    const room = newRoom(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
    await repository.save(room);
    const first = await mustFind(room);
    const second = await mustFind(room);
    expect(isSuccess(first.join(nicknameOf("b1"), ROOM_CREATED_AT, random))).toBe(true);
    expect(isSuccess(second.join(nicknameOf("b2"), ROOM_CREATED_AT, random))).toBe(true);
    expect(isSuccess(await repository.save(first))).toBe(true);
    const result = await repository.save(second);
    expect(isFailure(result) && result.error).toBe("save_conflict");
    const reread = await mustFind(room);
    const joined = reread.join(nicknameOf("b2"), ROOM_CREATED_AT, random);
    expect(isFailure(joined) && joined.error.code).toBe("room.room_full");
  });

  it("保存した後の同じ部屋（インスタンス）をもう一度保存すると衝突を返す", async () => {
    const room = newRoom();
    await repository.save(room);
    const read = await mustFind(room);
    expect(isSuccess(await repository.save(read))).toBe(true);
    const result = await repository.save(read);
    expect(isFailure(result) && result.error).toBe("save_conflict");
  });

  it("項目が無い部屋コードの保存済みの部屋を保存すると衝突を返し、項目も作られない", async () => {
    const room = restoredWith(newRoom(), Revision.restore(3));
    const result = await repository.save(room);
    expect(isFailure(result) && result.error).toBe("save_conflict");
    expect(await repository.findByCode(room.code)).toBeUndefined();
  });

  it("表が無いときは、衝突ではなく例外を投げる", async () => {
    const missing = new DynamoDbRoomRepository(client, "eshiritori-no-such-table");
    await expect(missing.save(newRoom())).rejects.toThrow(ResourceNotFoundException);
  });
});

describe("findByCode", () => {
  it("保存した部屋が無い部屋コードは undefined を返す", async () => {
    expect(await repository.findByCode(newRoom().code)).toBeUndefined();
  });

  it("最後の更新から 24 時間以上たった部屋も返し、最後に更新した時刻をミリ秒まで保つ", async () => {
    const updatedAt = new Date("2026-10-01T09:00:00.789Z");
    const room = restoredWith(newRoom(), Revision.initial(), updatedAt);
    await repository.save(room);
    const found = await mustFind(room);
    expect(found.lastUpdatedAt.getTime()).toBe(updatedAt.getTime());
    expect(found.isExpiredAt(ROOM_CREATED_AT)).toBe(true);
  });

  it("始まった部屋を、描く順の並びと始まった状態で返す", async () => {
    const room = newRoom(["あや", "いけ", "うみ"]);
    const started = room.start(room.host.token, ROOM_CREATED_AT, random);
    expect(isSuccess(started)).toBe(true);
    await repository.save(room);
    const found = await mustFind(room);
    expect(found.status.hasStarted()).toBe(true);
    expect(found.members.map((m) => m.playerId.value)).toEqual(
      room.members.map((m) => m.playerId.value),
    );
  });

  it("表が無いときは例外を投げる", async () => {
    const missing = new DynamoDbRoomRepository(client, "eshiritori-no-such-table");
    await expect(missing.findByCode(newRoom().code)).rejects.toThrow(ResourceNotFoundException);
  });
});
