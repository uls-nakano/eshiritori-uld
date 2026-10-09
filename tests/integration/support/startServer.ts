import { readApiConfig, startApi } from "@eshiritori/api";

import { assertTablesReady } from "../../support/assertTablesReady";

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

/** production と同じ composition で、空いているポートに API を起動する。 */
export async function startServer(): Promise<TestServer> {
  const config = readApiConfig(process.env);
  await assertTablesReady(config);
  const api = await startApi({ ...config, port: 0 });
  const baseUrl = `http://localhost:${String(api.port)}`;

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
    close: () => api.close(),
  };
}
