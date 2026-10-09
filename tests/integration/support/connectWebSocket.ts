import type { components } from "@eshiritori/api-contract";

type RoomNotification = components["schemas"]["RoomNotification"];

/** 部屋のメンバーとして開いた通知の接続。 */
export interface RoomSocket {
  /** 接続直後に届いた connected の通知。 */
  readonly connected: RoomNotification;
  /** 次の通知を待つ。timeoutMs 以内に届かなければ reject する。 */
  next(timeoutMs: number): Promise<RoomNotification>;
  close(): void;
}

/** 受信した本文を通知として読む。JSON.parse は unknown を返すため、生成型で受けるハーネスだけのキャスト。 */
function parseNotification(data: unknown): RoomNotification {
  return JSON.parse(String(data)) as RoomNotification;
}

/** 部屋のメンバーとして通知の接続を開き、connected が届くまで待つ。拒否されたら reject する。 */
export async function connectWebSocket(
  baseUrl: string,
  roomCode: string,
  playerToken: string,
): Promise<RoomSocket> {
  const url = new URL("/ws", baseUrl.replace(/^http/, "ws"));
  url.searchParams.set("roomCode", roomCode);
  url.searchParams.set("playerToken", playerToken);
  const socket = new WebSocket(url);

  // 接続した時点から溜める。await の合間に届いた通知を落とさない
  const received: RoomNotification[] = [];
  let wake: (() => void) | undefined;
  socket.addEventListener("message", (event) => {
    received.push(parseNotification(event.data));
    wake?.();
  });

  const next = (timeoutMs: number): Promise<RoomNotification> =>
    new Promise((resolve, reject) => {
      const take = (): boolean => {
        const first = received.shift();
        if (first === undefined) {
          return false;
        }
        clearTimeout(timer);
        wake = undefined;
        resolve(first);
        return true;
      };
      const timer = setTimeout(() => {
        wake = undefined;
        reject(new Error(`No notification arrived within ${String(timeoutMs)} ms.`));
      }, timeoutMs);
      if (!take()) {
        wake = () => {
          take();
        };
      }
    });

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve();
    });
    socket.addEventListener("error", () => {
      reject(new Error("WebSocket connection was rejected."));
    });
    socket.addEventListener("close", () => {
      reject(new Error("WebSocket connection was closed."));
    });
  });
  const connected = await next(1000).catch((error: unknown) => {
    socket.close();
    throw error;
  });
  return {
    connected,
    next,
    close: () => {
      socket.close();
    },
  };
}
