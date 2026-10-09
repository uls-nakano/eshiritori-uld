import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import type { DynamoDbConnectionRegistry, LocalWebSocketSender } from "@eshiritori/realtime";
import type { Clock, GetRoom, GetRoomOutput } from "@eshiritori/room";
import { RoomError } from "@eshiritori/room";
import { getLogger } from "@eshiritori/shared-kernel";

import { roomNotificationMessage } from "./RealtimeRoomEventPublisher";

/** WebSocket の入口が使うもの。 */
export interface WebSocketEndpointDependencies {
  readonly getRoom: GetRoom;
  readonly registry: DynamoDbConnectionRegistry;
  readonly sender: LocalWebSocketSender;
  readonly clock: Clock;
}

const WEBSOCKET_PATH = "/ws";

/** 本文なしで upgrade 要求を拒否する（ブラウザの WebSocket は拒否の本文を読めない）。 */
function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.end(
    `HTTP/1.1 ${String(status)} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

/**
 * HTTP サーバーの upgrade イベントに渡すハンドラを作る。
 * GET /ws?roomCode=&playerToken= で部屋のメンバーだけを受け入れ、接続を登録し、いまの部屋を connected で送る。
 */
export function createWebSocketUpgradeHandler(
  deps: WebSocketEndpointDependencies,
): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
  // 受け入れ（WebSocket への切り替え）が済んだか。済んだ後は HTTP の拒否の応答を書けない
  async function handle(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    state: { accepted: boolean },
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== WEBSOCKET_PATH) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    const credentials = {
      roomCode: url.searchParams.get("roomCode") ?? "",
      playerToken: url.searchParams.get("playerToken") ?? "",
    };
    let member: GetRoomOutput;
    try {
      member = await deps.getRoom.execute(credentials);
    } catch (error) {
      if (!(error instanceof RoomError)) {
        throw error;
      }
      if (error.errorCode === "room_not_found") {
        rejectUpgrade(socket, 404, "Not Found");
      } else {
        rejectUpgrade(socket, 403, "Forbidden");
      }
      return;
    }

    // 登録が終わる前に閉じられても登録が残らないよう、切断の処理は登録を待ってから消す
    let registered: Promise<void> = Promise.resolve();
    const roomCode = member.room.code;
    const accepting = deps.sender.accept(request, socket, head, (closedId) => {
      void registered
        .then(() => deps.registry.remove(roomCode, closedId))
        .catch((error: unknown) => {
          getLogger().warn("WebSocket の接続の登録を消せませんでした", {
            roomCode,
            connectionId: closedId,
            error,
          });
        });
    });
    const connectionId = await accepting;
    state.accepted = true;
    registered = deps.registry.register(
      { roomCode, connectionId, playerId: member.playerId },
      deps.clock.now(),
    );
    await registered;

    // 登録の後に読み直す。登録の前の写しを送ると、その間に入った人を取りこぼす
    // 読み直しが業務上の理由（期限切れなど）で失敗したら、登録の前に読んだ写しを送る
    const current = await deps.getRoom.execute(credentials).catch((error: unknown) => {
      if (error instanceof RoomError) {
        return member;
      }
      throw error;
    });
    await sendConnected(deps, roomCode, connectionId, current);
  }

  return (request, socket, head) => {
    const state = { accepted: false };
    handle(request, socket, head, state).catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      getLogger().error("WebSocket の接続の受け付けに失敗しました", {
        path: request.url?.split("?")[0],
        errorName: failure.name,
        stack: failure.stack,
      });
      if (!state.accepted) {
        rejectUpgrade(socket, 500, "Internal Server Error");
      }
    });
  };
}

/** 本人の接続にだけ、いまの部屋を connected で送る。接続がもう無ければ登録を消す。 */
async function sendConnected(
  deps: WebSocketEndpointDependencies,
  roomCode: string,
  connectionId: string,
  state: GetRoomOutput,
): Promise<void> {
  const outcome = await deps.sender.send(
    connectionId,
    roomNotificationMessage("connected", state.room),
  );
  if (outcome === "gone") {
    await deps.registry.remove(roomCode, connectionId);
  }
}
