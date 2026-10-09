import type { components } from "@eshiritori/api-contract";
import type {
  CreateRoom,
  GetRoom,
  JoinRoom,
  RoomError,
  RoomSnapshotDto,
  StartGame,
} from "@eshiritori/room";
import type { Result } from "@eshiritori/shared-kernel";
import { failure, getLogger, isFailure, success } from "@eshiritori/shared-kernel";
import type { Context } from "hono";
import { Hono } from "hono";

/** API が使う use case。 */
export interface ApiUseCases {
  readonly createRoom: CreateRoom;
  readonly joinRoom: JoinRoom;
  readonly getRoom: GetRoom;
  readonly startGame: StartGame;
}

type ErrorResponse = components["schemas"]["ErrorResponse"];

/** 要求の本文が契約の CreateRoomRequest の形か。値の範囲は見ない（domain の仕事）。 */
function isCreateRoomRequest(body: unknown): body is components["schemas"]["CreateRoomRequest"] {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return typeof candidate["nickname"] === "string" && typeof candidate["roundCount"] === "number";
}

/** 要求の本文が契約の JoinRoomRequest の形か。値の範囲は見ない（domain の仕事）。 */
function isJoinRoomRequest(body: unknown): body is components["schemas"]["JoinRoomRequest"] {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  return typeof (body as Record<string, unknown>)["nickname"] === "string";
}

/** 本文を JSON として読む。読めなければ request.invalid_json の失敗を返す。 */
async function readJson(c: Context): Promise<Result<unknown, ErrorResponse>> {
  try {
    return success(await c.req.json());
  } catch {
    return failure({ code: "request.invalid_json", detail: "Request body must be valid JSON." });
  }
}

/** RoomError を、契約の ErrorResponse と HTTP の status にして返す。 */
function roomErrorResponse(c: Context, error: RoomError): Response {
  return c.json(
    { code: error.code, detail: error.detail } satisfies ErrorResponse,
    statusOf(error),
  );
}

/** use case の部屋の写しを、契約の形に詰め替える。 */
export function toRoomSnapshot(dto: RoomSnapshotDto): components["schemas"]["RoomSnapshot"] {
  return {
    code: dto.code,
    roundCount: dto.roundCount,
    hostPlayerId: dto.hostPlayerId,
    status: dto.status,
    members: dto.members.map((member) => ({
      playerId: member.playerId,
      nickname: member.nickname,
    })),
  };
}

/** Authorization: Bearer <値> の値を返す。ヘッダーが無い・形が違うときは空文字を返す。 */
function readBearerToken(c: Context): string {
  const match = /^bearer +(\S+)$/i.exec(c.req.header("authorization") ?? "");
  return match?.[1] ?? "";
}

/** RoomError の種類から HTTP の status を決める。 */
function statusOf(error: RoomError): 400 | 403 | 404 | 409 {
  switch (error.errorCode) {
    case "nickname_empty":
    case "nickname_too_long":
    case "round_count_out_of_range":
      return 400;
    case "room_not_found":
      return 404;
    case "room_full":
    case "game_already_started":
    case "nickname_taken":
    case "not_enough_members":
      return 409;
    case "not_host":
    case "not_member":
      return 403;
  }
}

/** HTTP の入口を作る。use case を呼び、結果を契約の形で返す。 */
export function createApp(useCases: ApiUseCases): Hono {
  const app = new Hono();

  app.post("/rooms", async (c) => {
    const body = await readJson(c);
    if (isFailure(body)) {
      return c.json(body.error, 400);
    }
    if (!isCreateRoomRequest(body.value)) {
      return c.json(
        {
          code: "request.invalid_body",
          detail: "Request body must have a string nickname and a numeric roundCount.",
        } satisfies ErrorResponse,
        400,
      );
    }
    const result = await useCases.createRoom.execute({
      nickname: body.value.nickname,
      roundCount: body.value.roundCount,
    });
    if (isFailure(result)) {
      return roomErrorResponse(c, result.error);
    }
    const { room, playerId, playerToken } = result.value;
    return c.json(
      {
        room: toRoomSnapshot(room),
        player: { playerId, playerToken },
      } satisfies components["schemas"]["CreateRoomResponse"],
      201,
    );
  });

  app.post("/rooms/:roomCode/members", async (c) => {
    const body = await readJson(c);
    if (isFailure(body)) {
      return c.json(body.error, 400);
    }
    if (!isJoinRoomRequest(body.value)) {
      return c.json(
        {
          code: "request.invalid_body",
          detail: "Request body must have a string nickname.",
        } satisfies ErrorResponse,
        400,
      );
    }
    const result = await useCases.joinRoom.execute({
      roomCode: c.req.param("roomCode"),
      nickname: body.value.nickname,
    });
    if (isFailure(result)) {
      return roomErrorResponse(c, result.error);
    }
    const { room, playerId, playerToken } = result.value;
    return c.json(
      {
        room: toRoomSnapshot(room),
        player: { playerId, playerToken },
      } satisfies components["schemas"]["JoinRoomResponse"],
      201,
    );
  });

  app.get("/rooms/:roomCode", async (c) => {
    const result = await useCases.getRoom.execute({
      roomCode: c.req.param("roomCode"),
      playerToken: readBearerToken(c),
    });
    if (isFailure(result)) {
      return roomErrorResponse(c, result.error);
    }
    return c.json(
      {
        room: toRoomSnapshot(result.value.room),
        playerId: result.value.playerId,
      } satisfies components["schemas"]["GetRoomResponse"],
      200,
    );
  });

  // 契約に本文が無いので、送られてきても読まない
  app.post("/rooms/:roomCode/start", async (c) => {
    const result = await useCases.startGame.execute({
      roomCode: c.req.param("roomCode"),
      playerToken: readBearerToken(c),
    });
    if (isFailure(result)) {
      return roomErrorResponse(c, result.error);
    }
    return c.json(
      {
        room: toRoomSnapshot(result.value.room),
      } satisfies components["schemas"]["StartGameResponse"],
      200,
    );
  });

  app.onError((error, c) => {
    getLogger().error("API の処理中に予期しない例外が起きました", {
      method: c.req.method,
      path: c.req.path,
      errorName: error.name,
      stack: error.stack,
    });
    return c.json(
      { code: "server.internal_error", detail: "Internal server error." } satisfies ErrorResponse,
      500,
    );
  });

  return app;
}
