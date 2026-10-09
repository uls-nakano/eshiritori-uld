import { Server } from "node:http";

import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { composeApp, createDynamoDbClient, readApiConfig } from "@eshiritori/api";
import { serve } from "@hono/node-server";

/** 結合テストが相手にする、待ち受け中の API サーバー。 */
export interface TestServer {
  readonly baseUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- 応答の型は呼び出し側が契約の生成型で指定する
  postJson<TBody>(
    path: string,
    body: unknown,
    playerToken?: string,
  ): Promise<{ status: number; body: TBody }>;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- 応答の型は呼び出し側が契約の生成型で指定する
  getJson<TBody>(path: string, playerToken?: string): Promise<{ status: number; body: TBody }>;
  close(): Promise<void>;
}

/** DB の表が使えることを確かめる。使えなければ起動手順を案内して throw する。 */
async function assertTableReady(config: ReturnType<typeof readApiConfig>): Promise<void> {
  try {
    await createDynamoDbClient(config).send(
      new DescribeTableCommand({ TableName: config.roomTableName }),
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    throw new Error(
      `DynamoDB Local に接続できないか、部屋の表がありません。\`npm run db:up\` を実行してください（${name}）`,
      { cause: error },
    );
  }
}

/** production と同じ composition で、空いているポートに API を起動する。 */
export async function startServer(): Promise<TestServer> {
  const config = readApiConfig(process.env);
  await assertTableReady(config);
  const app = composeApp(config);

  const server = await new Promise<Server>((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0 }, () => {
      // serve の戻り値は union 型だが、createServer を指定しない限り node:http の Server になる。実体で確かめて絞る
      if (!(started instanceof Server)) {
        throw new Error("Expected serve() to return a node:http Server.");
      }
      resolve(started);
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the server to listen on a TCP port.");
  }
  const baseUrl = `http://localhost:${String(address.port)}`;

  return {
    baseUrl,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- 応答の型は呼び出し側が契約の生成型で指定する
    async postJson<TBody>(path: string, body: unknown, playerToken?: string) {
      // 本文が undefined のときは、本文の無い要求（開始など）として content-type も付けない
      const headers: Record<string, string> = {};
      if (body !== undefined) {
        headers["content-type"] = "application/json";
      }
      if (playerToken !== undefined) {
        headers["authorization"] = `Bearer ${playerToken}`;
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body:
          body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
      // Response.json() は unknown を返す。生成型を指定して受けるための、テストのハーネスだけのキャスト
      return { status: response.status, body: (await response.json()) as TBody };
    },
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- 応答の型は呼び出し側が契約の生成型で指定する
    async getJson<TBody>(path: string, playerToken?: string) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: playerToken === undefined ? {} : { authorization: `Bearer ${playerToken}` },
      });
      // postJson と同じ理由のキャスト
      return { status: response.status, body: (await response.json()) as TBody };
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
    },
  };
}
