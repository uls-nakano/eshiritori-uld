import type { components } from "@eshiritori/api-contract";
import type { CreateRoom, RoomError } from "@eshiritori/room";
import { getLogger, isFailure } from "@eshiritori/shared-kernel";
import { Hono } from "hono";

/** API が使う use case。 */
export interface ApiUseCases {
  readonly createRoom: CreateRoom;
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
      return 403;
  }
}

/** HTTP の入口を作る。use case を呼び、結果を契約の形で返す。 */
export function createApp(useCases: ApiUseCases): Hono {
  const app = new Hono();

  app.post("/rooms", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          code: "request.invalid_json",
          detail: "Request body must be valid JSON.",
        } satisfies ErrorResponse,
        400,
      );
    }
    if (!isCreateRoomRequest(body)) {
      return c.json(
        {
          code: "request.invalid_body",
          detail: "Request body must have a string nickname and a numeric roundCount.",
        } satisfies ErrorResponse,
        400,
      );
    }
    const result = await useCases.createRoom.execute({
      nickname: body.nickname,
      roundCount: body.roundCount,
    });
    if (isFailure(result)) {
      return c.json(
        { code: result.error.code, detail: result.error.detail } satisfies ErrorResponse,
        statusOf(result.error),
      );
    }
    const { room, playerId, playerToken } = result.value;
    return c.json(
      {
        room: {
          code: room.code,
          roundCount: room.roundCount,
          hostPlayerId: room.hostPlayerId,
          members: room.members.map((member) => ({
            playerId: member.playerId,
            nickname: member.nickname,
          })),
        },
        player: { playerId, playerToken },
      } satisfies components["schemas"]["CreateRoomResponse"],
      201,
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
