import type { components } from "@eshiritori/api-contract";
import type { DynamoDbConnectionRegistry, WebSocketSender } from "@eshiritori/realtime";
import type { RoomEventPublisher, RoomSnapshotDto } from "@eshiritori/room";

import { toRoomSnapshot } from "./createApp";

type RoomNotification = components["schemas"]["RoomNotification"];

/** 通知の本文（JSON 文字列）を作る。webSocketEndpoint の connected も同じ形で作る。 */
export function roomNotificationMessage(
  type: RoomNotification["type"],
  room: RoomSnapshotDto,
): string {
  return JSON.stringify({ type, room: toRoomSnapshot(room) } satisfies RoomNotification);
}

/** 部屋の変化を、部屋に登録された全接続へ WebSocket で送る。 */
export class RealtimeRoomEventPublisher implements RoomEventPublisher {
  constructor(
    private readonly registry: DynamoDbConnectionRegistry,
    private readonly sender: WebSocketSender,
  ) {}

  publishMemberJoined(room: RoomSnapshotDto): Promise<void> {
    return this.#publish("member_joined", room);
  }

  publishGameStarted(room: RoomSnapshotDto): Promise<void> {
    return this.#publish("game_started", room);
  }

  async #publish(type: RoomNotification["type"], room: RoomSnapshotDto): Promise<void> {
    const message = roomNotificationMessage(type, room);
    const connections = await this.registry.findByRoom(room.code);
    await Promise.all(
      connections.map(async (connection) => {
        const outcome = await this.sender.send(connection.connectionId, message);
        if (outcome === "gone") {
          await this.registry.remove(connection.roomCode, connection.connectionId);
        }
      }),
    );
  }
}
