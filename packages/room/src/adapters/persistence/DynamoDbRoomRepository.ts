import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient, PutCommandInput } from "@aws-sdk/lib-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Result } from "@eshiritori/shared-kernel";
import { failure, success } from "@eshiritori/shared-kernel";

import type { Room } from "../../domain/room/Room";
import type { RoomCode } from "../../domain/room/RoomCode";
import type { RoomRepository, RoomSaveConflict } from "../../domain/room/RoomRepository";
import { RoomItemMapper } from "./RoomItemMapper";

/** DynamoDB の部屋リポジトリ。1 部屋 1 項目で、改訂番号を条件にした書き込みで同時の保存を見分ける。 */
export class DynamoDbRoomRepository implements RoomRepository {
  readonly #client: DynamoDBDocumentClient;
  readonly #tableName: string;
  readonly #mapper = new RoomItemMapper();

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.#client = client;
    this.#tableName = tableName;
  }

  /** 部屋コードの部屋を復元する。無ければ undefined。期限切れの部屋も返す。 */
  async findByCode(code: RoomCode): Promise<Room | undefined> {
    const output = await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { roomCode: code.value },
        ConsistentRead: true,
      }),
    );
    if (output.Item === undefined) {
      return undefined;
    }
    return this.#mapper.toRoom(output.Item);
  }

  /** 読んだときの改訂番号を条件に保存する。条件が外れたら書き込まず衝突を返す。 */
  async save(room: Room): Promise<Result<void, RoomSaveConflict>> {
    const condition: Pick<
      PutCommandInput,
      "ConditionExpression" | "ExpressionAttributeNames" | "ExpressionAttributeValues"
    > = room.revision.isInitial()
      ? {
          ConditionExpression: "attribute_not_exists(#roomCode)",
          ExpressionAttributeNames: { "#roomCode": "roomCode" },
        }
      : {
          ConditionExpression: "#revision = :readRevision",
          ExpressionAttributeNames: { "#revision": "revision" },
          ExpressionAttributeValues: { ":readRevision": room.revision.value },
        };
    try {
      await this.#client.send(
        new PutCommand({
          TableName: this.#tableName,
          Item: this.#mapper.toItem(room, room.revision.next()),
          ...condition,
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return failure("save_conflict");
      }
      throw error;
    }
    return success(undefined);
  }
}
