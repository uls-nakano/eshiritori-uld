import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  CreateRoom,
  CryptoRandomSource,
  DynamoDbRoomRepository,
  roomTable,
} from "@eshiritori/room";
import { getLogger } from "@eshiritori/shared-kernel";
import type { Hono } from "hono";

import { createApp } from "./createApp";

/** API の設定。 */
export interface ApiConfig {
  readonly port: number;
  readonly dynamoDbEndpoint: string;
  readonly roomTableName: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_DYNAMODB_ENDPOINT = "http://localhost:8000";

/** 環境変数から設定を読む。PORT が整数でなければ throw する。 */
export function readApiConfig(env: Readonly<Record<string, string | undefined>>): ApiConfig {
  const rawPort = env["PORT"];
  const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port)) {
    getLogger().error("PORT が整数ではありません", { port: rawPort });
    throw new Error("PORT must be an integer.");
  }
  return {
    port,
    dynamoDbEndpoint: env["DYNAMODB_ENDPOINT"] ?? DEFAULT_DYNAMODB_ENDPOINT,
    roomTableName: roomTable.name,
  };
}

/** ローカルの DynamoDB Local に向けた client を作る。AWS 向けはデプロイの要求で足す。 */
export function createDynamoDbClient(config: ApiConfig): DynamoDBClient {
  return new DynamoDBClient({
    endpoint: config.dynamoDbEndpoint,
    region: "ap-northeast-1",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  });
}

/** adapter を use case に注入して、HTTP の入口を組み立てる。 */
export function composeApp(config: ApiConfig): Hono {
  const client = DynamoDBDocumentClient.from(createDynamoDbClient(config));
  const repository = new DynamoDbRoomRepository(client, config.roomTableName);
  const createRoom = new CreateRoom(repository, new CryptoRandomSource(), {
    now: () => new Date(),
  });
  return createApp({ createRoom });
}
