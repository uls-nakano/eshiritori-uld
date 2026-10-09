import type { components } from "@eshiritori/api-contract";

export type RoomNotification = components["schemas"]["RoomNotification"];

/** 開いた接続。ページを離れるときに閉じる。 */
interface RoomSocket {
  close(): void;
}

/** 部屋の通知を受ける接続を開く口。ページはこの型だけを知る。 */
export type ConnectRoomSocket = (params: {
  roomCode: string;
  playerToken: string;
  onNotification: (notification: RoomNotification) => void;
}) => RoomSocket;

const isRoomNotification = (value: unknown): value is RoomNotification => {
  if (typeof value !== "object" || value === null) return false;
  const { type, room } = value as { type?: unknown; room?: unknown };
  if (typeof type !== "string") return false;
  if (typeof room !== "object" || room === null) return false;
  return Array.isArray((room as { members?: unknown }).members);
};

/** socketUrl（例: ws://localhost:5173/ws）にブラウザ標準の WebSocket で接続する口を作る。 */
export function createRoomSocketConnector(socketUrl: string): ConnectRoomSocket {
  return ({ roomCode, playerToken, onNotification }) => {
    const url = new URL(socketUrl);
    url.search = new URLSearchParams({ roomCode, playerToken }).toString();
    const socket = new WebSocket(url);
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return; // JSON でないメッセージは捨てる
      }
      if (!isRoomNotification(parsed)) return; // 形の違うメッセージも捨てる
      onNotification(parsed);
    });
    return {
      close: () => {
        socket.close();
      },
    };
  };
}
