import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalWebSocketSender } from "./LocalWebSocketSender";

let sender: LocalWebSocketSender;
let server: Server;
let url: string;
let accepted: Promise<string>[];
let closedIds: string[];
let clients: WebSocket[];

beforeEach(async () => {
  sender = new LocalWebSocketSender();
  accepted = [];
  closedIds = [];
  clients = [];
  server = createServer();
  server.on("upgrade", (req, socket, head) => {
    const result = sender.accept(req, socket, head, (id) => {
      closedIds.push(id);
    });
    result.catch(() => undefined);
    accepted.push(result);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  await sender.closeAll();
  for (const client of clients) {
    client.close();
  }
  server.closeAllConnections();
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

/** クライアントを接続し、サーバー側が受け入れた接続 ID と対にして返す。 */
async function connect(): Promise<{ client: WebSocket; connectionId: string }> {
  const client = new WebSocket(url);
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.addEventListener("open", () => {
      resolve();
    });
    client.addEventListener("error", () => {
      reject(new Error("connect failed"));
    });
  });
  const pending = accepted.at(-1);
  if (pending === undefined) {
    throw new Error("connection was not accepted");
  }
  const connectionId = await pending;
  return { client, connectionId };
}

function nextMessage(client: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    client.addEventListener(
      "message",
      (event) => {
        resolve(String(event.data));
      },
      { once: true },
    );
  });
}

function closed(client: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (client.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    client.addEventListener(
      "close",
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

describe("accept", () => {
  it("2 つのクライアントの接続を受け入れると、それぞれ別の接続 ID を返す", async () => {
    const first = await connect();
    const second = await connect();

    expect(first.connectionId).not.toBe(second.connectionId);
  });

  it("WebSocket のハンドシェイクでない upgrade 要求は reject する", async () => {
    const port = (server.address() as AddressInfo).port;
    const req = request({
      host: "127.0.0.1",
      port,
      headers: { Connection: "Upgrade", Upgrade: "websocket" },
    });
    req.on("error", () => undefined);
    req.on("response", (res) => res.resume());
    req.end();

    await vi.waitFor(() => {
      expect(accepted).toHaveLength(1);
    });
    await expect(accepted[0]).rejects.toThrow("WebSocket handshake failed");
  });

  it("クライアントが接続を閉じると、onClose がその接続 ID で 1 回呼ばれる", async () => {
    const { client, connectionId } = await connect();

    client.close();

    await vi.waitFor(() => {
      expect(closedIds).toEqual([connectionId]);
    });
  });
});

describe("send", () => {
  it("受け入れた接続に送ると sent を返し、クライアントが同じ文字列を受け取る", async () => {
    const { client, connectionId } = await connect();
    const received = nextMessage(client);

    const outcome = await sender.send(connectionId, "こんにちは");

    expect(outcome).toBe("sent");
    expect(await received).toBe("こんにちは");
  });

  it("2 つの接続のうち一方に送ると、もう一方には届かない", async () => {
    const first = await connect();
    const second = await connect();
    const received = nextMessage(first.client);
    const unexpected = vi.fn();
    second.client.addEventListener("message", unexpected);

    await sender.send(first.connectionId, "first-only");
    await received;
    // second への配信が起きるなら、first と同じ往復の間に届いているはず
    await sender.send(second.connectionId, "second-only");
    await vi.waitFor(() => {
      expect(unexpected).toHaveBeenCalledTimes(1);
    });

    expect(String((unexpected.mock.calls[0]?.[0] as MessageEvent).data)).toBe("second-only");
  });

  it("知らない接続 ID には gone を返す", async () => {
    expect(await sender.send("unknown", "x")).toBe("gone");
  });

  it("クライアントが閉じた後の接続には gone を返す", async () => {
    const { client, connectionId } = await connect();

    client.close();
    await vi.waitFor(() => {
      expect(closedIds).toEqual([connectionId]);
    });

    expect(await sender.send(connectionId, "x")).toBe("gone");
  });
});

describe("closeAll", () => {
  it("受け入れた接続がすべて閉じられ、クライアントが close を受け取る", async () => {
    const first = await connect();
    const second = await connect();

    await sender.closeAll();

    await Promise.all([closed(first.client), closed(second.client)]);
    expect(first.client.readyState).toBe(WebSocket.CLOSED);
    expect(second.client.readyState).toBe(WebSocket.CLOSED);
  });
});
