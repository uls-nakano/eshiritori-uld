import { Server } from "node:http";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  connectionTable,
  DynamoDbConnectionRegistry,
  LocalWebSocketSender,
} from "@eshiritori/realtime";
import {
  CreateRoom,
  CryptoRandomSource,
  DynamoDbRoomRepository,
  GetRoom,
  JoinRoom,
  roomTable,
  StartGame,
} from "@eshiritori/room";
import { getLogger } from "@eshiritori/shared-kernel";
import { serve } from "@hono/node-server";

import { createApp } from "./createApp";
import { RealtimeRoomEventPublisher } from "./RealtimeRoomEventPublisher";
import { createWebSocketUpgradeHandler } from "./webSocketEndpoint";

/** API の設定。 */
export interface ApiConfig {
  readonly port: number;
  readonly dynamoDbEndpoint: string;
  readonly roomTableName: string;
  readonly connectionTableName: string;
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
    connectionTableName: connectionTable.name,
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

/** 起動した API。 */
export interface RunningApi {
  /** 待ち受けているポート。config の port が 0 のときは割り当てられた値。 */
  readonly port: number;
  close(): Promise<void>;
}

/** adapter を use case に注入して HTTP と WebSocket の入口を組み立て、待ち受けを始める。 */
export async function startApi(config: ApiConfig): Promise<RunningApi> {
  const dynamoDbClient = createDynamoDbClient(config);
  const client = DynamoDBDocumentClient.from(dynamoDbClient);
  const repository = new DynamoDbRoomRepository(client, config.roomTableName);
  const registry = new DynamoDbConnectionRegistry(client, config.connectionTableName);
  const sender = new LocalWebSocketSender();
  const publisher = new RealtimeRoomEventPublisher(registry, sender);
  const random = new CryptoRandomSource();
  const clock = { now: () => new Date() };
  const getRoom = new GetRoom(repository, clock);
  const app = createApp({
    createRoom: new CreateRoom(repository, random, clock),
    joinRoom: new JoinRoom(repository, random, clock, publisher),
    getRoom,
    startGame: new StartGame(repository, random, clock, publisher),
  });

  const server = await new Promise<Server>((resolve) => {
    const started = serve({ fetch: app.fetch, port: config.port }, () => {
      // serve の戻り値は union 型だが、createServer を指定しない限り node:http の Server になる。実体で確かめて絞る
      if (!(started instanceof Server)) {
        throw new Error("Expected serve() to return a node:http Server.");
      }
      resolve(started);
    });
  });
  server.on("upgrade", createWebSocketUpgradeHandler({ getRoom, registry, sender, clock }));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the server to listen on a TCP port.");
  }

  return {
    port: address.port,
    async close(): Promise<void> {
      await sender.closeAll();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
      dynamoDbClient.destroy();
    },
  };
}
