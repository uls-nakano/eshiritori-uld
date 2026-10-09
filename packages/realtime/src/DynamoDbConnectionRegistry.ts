import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  paginateQuery,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { getLogger } from "@eshiritori/shared-kernel";

/** 掃除のためだけの寿命。振る舞いの根拠にしない（TTL の削除は時刻ちょうどには行われない）。 */
const CONNECTION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** 部屋につながっている WebSocket の接続。 */
export interface RoomConnection {
  readonly roomCode: string;
  readonly connectionId: string;
  readonly playerId: string;
}

/** 接続の登録と検索を DynamoDB の接続表で行う。 */
export class DynamoDbConnectionRegistry {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  /** 接続を部屋に登録する。同じ接続をもう一度登録しても 1 件のまま（上書き）。 */
  async register(connection: RoomConnection, connectedAt: Date): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          roomCode: connection.roomCode,
          connectionId: connection.connectionId,
          playerId: connection.playerId,
          connectedAt: connectedAt.toISOString(),
          expiresAt: Math.ceil((connectedAt.getTime() + CONNECTION_LIFETIME_MS) / 1000),
        },
      }),
    );
  }

  /** 部屋に登録された接続をすべて返す。無ければ空配列。 */
  async findByRoom(roomCode: string): Promise<RoomConnection[]> {
    const connections: RoomConnection[] = [];
    const pages = paginateQuery(
      { client: this.client },
      {
        TableName: this.tableName,
        KeyConditionExpression: "#roomCode = :roomCode",
        ExpressionAttributeNames: { "#roomCode": "roomCode" },
        ExpressionAttributeValues: { ":roomCode": roomCode },
        ProjectionExpression: "roomCode, connectionId, playerId",
        ConsistentRead: true,
      },
    );
    for await (const page of pages) {
      for (const item of page.Items ?? []) {
        connections.push({
          roomCode: stringAttribute(item, "roomCode", roomCode),
          connectionId: stringAttribute(item, "connectionId", roomCode),
          playerId: stringAttribute(item, "playerId", roomCode),
        });
      }
    }
    return connections;
  }

  /** 接続の登録を消す。無くても失敗しない。 */
  async remove(roomCode: string, connectionId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({ TableName: this.tableName, Key: { roomCode, connectionId } }),
    );
  }
}

function stringAttribute(
  item: Record<string, unknown>,
  attribute: string,
  roomCode: string,
): string {
  const value = item[attribute];
  if (typeof value !== "string") {
    getLogger().error("保存された接続の項目の形が正しくありません", { roomCode, attribute });
    throw new Error(`Stored connection item is invalid: ${attribute}`);
  }
  return value;
}
