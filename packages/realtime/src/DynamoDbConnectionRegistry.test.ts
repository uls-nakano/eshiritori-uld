import { randomUUID } from "node:crypto";

import {
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { beforeAll, describe, expect, it } from "vitest";

import { connectionTable } from "./connectionTable";
import { DynamoDbConnectionRegistry, type RoomConnection } from "./DynamoDbConnectionRegistry";

const dynamoClient = new DynamoDBClient({
  endpoint: process.env["DYNAMODB_ENDPOINT"] ?? "http://localhost:8000",
  region: "ap-northeast-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const client = DynamoDBDocumentClient.from(dynamoClient);
const registry = new DynamoDbConnectionRegistry(client, connectionTable.name);
/**
 * 登録した時刻。実行時の現在時刻にする。
 * 固定の過去日時にすると TTL がすでに過ぎており、DynamoDB Local の TTL の掃除がテスト中に項目を消して不安定になる。
 */
const CONNECTED_AT = new Date(Math.floor(Date.now() / 1000) * 1000);

beforeAll(async () => {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: connectionTable.name }));
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    throw new Error(
      `DynamoDB Local に接続できないか、接続の表がありません。\`npm run db:up\` を実行してください（${name}）`,
      { cause: error },
    );
  }
});

function newRoomCode(): string {
  return `room-${randomUUID()}`;
}

function connectionOf(roomCode: string, playerId = "player-1"): RoomConnection {
  return { roomCode, connectionId: `conn-${randomUUID()}`, playerId };
}

function sortById(connections: RoomConnection[]): RoomConnection[] {
  return [...connections].sort((a, b) => a.connectionId.localeCompare(b.connectionId));
}

describe("register", () => {
  it("登録した接続が、部屋コードで検索するとプレイヤー ID 付きで返る", async () => {
    const connection = connectionOf(newRoomCode(), "player-ayaka");

    await registry.register(connection, CONNECTED_AT);

    expect(await registry.findByRoom(connection.roomCode)).toEqual([connection]);
  });

  it("同じ接続をもう一度登録しても、検索で 1 件だけ返る", async () => {
    const connection = connectionOf(newRoomCode());

    await registry.register(connection, CONNECTED_AT);
    await registry.register(connection, CONNECTED_AT);

    expect(await registry.findByRoom(connection.roomCode)).toEqual([connection]);
  });

  it("登録した項目の期限は、つないだ時刻の 24 時間後のエポック秒になる", async () => {
    const connection = connectionOf(newRoomCode());

    await registry.register(connection, CONNECTED_AT);

    const output = await client.send(
      new GetCommand({
        TableName: connectionTable.name,
        Key: { roomCode: connection.roomCode, connectionId: connection.connectionId },
      }),
    );
    expect(output.Item?.["expiresAt"]).toBe(CONNECTED_AT.getTime() / 1000 + 24 * 60 * 60);
  });
});

describe("findByRoom", () => {
  it("2 つの部屋に登録した接続のうち、指定した部屋の接続だけが返る", async () => {
    const roomCode = newRoomCode();
    const first = connectionOf(roomCode, "player-1");
    const second = connectionOf(roomCode, "player-2");
    const other = connectionOf(newRoomCode(), "player-3");
    await registry.register(first, CONNECTED_AT);
    await registry.register(second, CONNECTED_AT);
    await registry.register(other, CONNECTED_AT);

    const found = await registry.findByRoom(roomCode);

    expect(sortById(found)).toEqual(sortById([first, second]));
  });

  it("接続が無い部屋は空配列を返す", async () => {
    expect(await registry.findByRoom(newRoomCode())).toEqual([]);
  });

  it("形の正しくない項目が保存されていると、例外を投げる", async () => {
    const roomCode = newRoomCode();
    await client.send(
      new PutCommand({
        TableName: connectionTable.name,
        Item: { roomCode, connectionId: "conn-broken", playerId: 123 },
      }),
    );

    await expect(registry.findByRoom(roomCode)).rejects.toThrow(
      "Stored connection item is invalid: playerId",
    );
  });

  it("表が無いときは例外を投げる", async () => {
    const missing = new DynamoDbConnectionRegistry(client, `missing-${randomUUID()}`);

    await expect(missing.findByRoom(newRoomCode())).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});

describe("remove", () => {
  it("消した接続は検索で返らず、同じ部屋のほかの接続は残る", async () => {
    const roomCode = newRoomCode();
    const removed = connectionOf(roomCode, "player-1");
    const kept = connectionOf(roomCode, "player-2");
    await registry.register(removed, CONNECTED_AT);
    await registry.register(kept, CONNECTED_AT);

    await registry.remove(roomCode, removed.connectionId);

    expect(await registry.findByRoom(roomCode)).toEqual([kept]);
  });

  it("登録されていない接続を消しても失敗しない", async () => {
    await expect(registry.remove(newRoomCode(), "conn-unknown")).resolves.toBeUndefined();
  });
});
