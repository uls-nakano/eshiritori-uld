import type { components } from "@eshiritori/api-contract";

type Schemas = components["schemas"];
type ErrorCode = Schemas["ErrorResponse"]["code"];
type CreateRoomRequest = Schemas["CreateRoomRequest"];
type CreateRoomResponse = Schemas["CreateRoomResponse"];
type JoinRoomRequest = Schemas["JoinRoomRequest"];
type JoinRoomResponse = Schemas["JoinRoomResponse"];
type GetRoomResponse = Schemas["GetRoomResponse"];
type StartGameResponse = Schemas["StartGameResponse"];

/** 呼び出しの結果。失敗は ErrorResponse.code（表示は describeFormError が決める）。 */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

/** 成功かどうかの型ガード。ページは result.ok を直接読まずにこれで分岐する。 */
export const isApiSuccess = <T>(result: ApiResult<T>): result is { ok: true; value: T } =>
  result.ok;

/** 失敗かどうかの型ガード。 */
export const isApiFailure = <T>(result: ApiResult<T>): result is { ok: false; code: ErrorCode } =>
  !result.ok;

/** 部屋の API の呼び出し口。 */
export interface ApiClient {
  createRoom: (request: CreateRoomRequest) => Promise<ApiResult<CreateRoomResponse>>;
  joinRoom: (roomCode: string, request: JoinRoomRequest) => Promise<ApiResult<JoinRoomResponse>>;
  getRoom: (roomCode: string, playerToken: string) => Promise<ApiResult<GetRoomResponse>>;
  startGame: (roomCode: string, playerToken: string) => Promise<ApiResult<StartGameResponse>>;
}

const readErrorCode = async (response: Response): Promise<ErrorCode> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      typeof body.code === "string"
    ) {
      return body.code;
    }
    return "server.internal_error";
  } catch {
    return "server.internal_error";
  }
};

/** baseUrl（例: 画面と同じオリジン）に向けて fetch で呼ぶ。 */
export function createApiClient(baseUrl: string, fetchFn: typeof fetch): ApiClient {
  const call = async <T>(
    path: string,
    method: "GET" | "POST",
    options: { body?: unknown; playerToken?: string } = {},
  ): Promise<ApiResult<T>> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.playerToken !== undefined) headers.Authorization = `Bearer ${options.playerToken}`;
    let response: Response;
    try {
      response = await fetchFn(new URL(path, baseUrl).href, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      return { ok: false, code: "network.unreachable" };
    }
    if (response.ok) {
      try {
        // 本文の形は検査しない: サーバーと画面は同じ OpenAPI 契約から型を作り、食い違いは型検査と結合テストで止まる
        return { ok: true, value: (await response.json()) as T };
      } catch {
        return { ok: false, code: "server.internal_error" };
      }
    }
    return { ok: false, code: await readErrorCode(response) };
  };

  const roomPath = (roomCode: string): string => `/rooms/${encodeURIComponent(roomCode)}`;

  return {
    createRoom: (request) => call("/rooms", "POST", { body: request }),
    joinRoom: (roomCode, request) =>
      roomCode === ""
        ? Promise.resolve({ ok: false, code: "room.room_not_found" })
        : call(`${roomPath(roomCode)}/members`, "POST", { body: request }),
    getRoom: (roomCode, playerToken) => call(roomPath(roomCode), "GET", { playerToken }),
    startGame: (roomCode, playerToken) =>
      call(`${roomPath(roomCode)}/start`, "POST", { playerToken }),
  };
}
