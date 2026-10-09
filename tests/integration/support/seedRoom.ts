import { randomBytes, randomInt } from "node:crypto";

import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createDynamoDbClient, readApiConfig } from "@eshiritori/api";

/** 前提として書いた部屋のメンバー。 */
interface SeededMember {
  readonly playerId: string;
  readonly playerToken: string;
  readonly nickname: string;
}

/** 前提として書いた部屋。メンバーの先頭がホスト。 */
export interface SeededRoom {
  readonly code: string;
  readonly members: readonly SeededMember[];
}

/** 前提の部屋の指定。 */
export interface SeedRoomOptions {
  /** メンバーのニックネーム。先頭がホスト。1〜8 人。 */
  readonly nicknames: readonly string[];
  /** 進行状態。既定は "waiting"。 */
  readonly status?: "waiting" | "started";
  /** 最後に更新した時刻。既定はいま。 */
  readonly lastUpdatedAt?: Date;
}

const ROOM_LIFETIME_SECONDS = 24 * 60 * 60;
const CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARACTERS.charAt(randomInt(CODE_CHARACTERS.length));
  }
  return code;
}

function randomId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * 前提の部屋を、部屋の表に直に書く。
 * この段の API では作れない前提（ゲームが始まった部屋、最後の更新から 24 時間たった部屋）と、
 * 8 人の部屋のように API を何度も呼ばないと作れない前提を、検証したい基準と別の要求に頼らずに用意するため。
 * 項目の形は RoomItemMapper が読む形にそろえている。部屋が復元できなければ API は 500 を返し、結合テストが落ちる。
 * 部屋コードとプレイヤー識別子・トークンは毎回別の値にし、テスト同士が干渉しないようにする。
 */
export async function seedRoom(options: SeedRoomOptions): Promise<SeededRoom> {
  const config = readApiConfig(process.env);
  const client = createDynamoDbClient(config);
  try {
    const code = randomCode();
    const members = options.nicknames.map((nickname) => ({
      playerId: randomId(),
      playerToken: randomId(),
      nickname,
    }));
    const host = members[0];
    if (host === undefined) {
      throw new Error("seedRoom needs at least one nickname.");
    }
    const lastUpdatedAt = options.lastUpdatedAt ?? new Date();
    const item: Record<string, AttributeValue> = {
      roomCode: { S: code },
      members: {
        L: members.map((member) => ({
          M: {
            playerId: { S: member.playerId },
            token: { S: member.playerToken },
            nickname: { S: member.nickname },
          },
        })),
      },
      hostPlayerId: { S: host.playerId },
      roundCount: { N: "1" },
      status: { S: options.status ?? "waiting" },
      lastUpdatedAt: { S: lastUpdatedAt.toISOString() },
      revision: { N: "1" },
      expiresAt: { N: String(Math.ceil(lastUpdatedAt.getTime() / 1000) + ROOM_LIFETIME_SECONDS) },
    };
    await client.send(
      new PutItemCommand({
        TableName: config.roomTableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(roomCode)",
      }),
    );
    return { code, members };
  } finally {
    client.destroy();
  }
}
