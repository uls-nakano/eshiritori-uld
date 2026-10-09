import { describe, expect, it } from "vitest";

import { createApiClient } from "./apiClient";

interface Recorded {
  url: string;
  init: RequestInit;
}

const setup = (respond: () => Response | Promise<Response>) => {
  const calls: Recorded[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init: init ?? {} });
    return Promise.resolve(respond());
  };
  return { calls, client: createApiClient("https://eshiritori.example", fetchFn) };
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const room = {
  code: "K7Q2XM",
  roundCount: 1,
  hostPlayerId: "p-taro",
  status: "waiting",
  members: [{ playerId: "p-taro", nickname: "たろう" }],
};

describe("createRoom", () => {
  it("POST /rooms に本文を送り、201 の本文を成功の値で返す", async () => {
    const created = { room, player: { playerId: "p-taro", playerToken: "token-taro" } };
    const { calls, client } = setup(() => json(201, created));
    const result = await client.createRoom({ nickname: "たろう", roundCount: 1 });
    expect(result).toEqual({ ok: true, value: created });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://eshiritori.example/rooms");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"nickname":"たろう","roundCount":1}');
    expect(calls[0]?.init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("400 の ErrorResponse は code を失敗で返す", async () => {
    const { client } = setup(() =>
      json(400, { code: "room.nickname_empty", detail: "ニックネームが空です" }),
    );
    expect(await client.createRoom({ nickname: "", roundCount: 1 })).toEqual({
      ok: false,
      code: "room.nickname_empty",
    });
  });

  it("本文が JSON でない 404 は server.internal_error", async () => {
    const { client } = setup(() => new Response("Not Found", { status: 404 }));
    expect(await client.createRoom({ nickname: "たろう", roundCount: 1 })).toEqual({
      ok: false,
      code: "server.internal_error",
    });
  });

  it("fetch が拒否したら network.unreachable", async () => {
    const client = createApiClient("https://eshiritori.example", () =>
      Promise.reject(new TypeError("failed")),
    );
    expect(await client.createRoom({ nickname: "たろう", roundCount: 1 })).toEqual({
      ok: false,
      code: "network.unreachable",
    });
  });
});

describe("joinRoom", () => {
  it("POST /rooms/{部屋コード}/members に部屋コードを入力のまま（encodeURIComponent して）送る", async () => {
    const { calls, client } = setup(() =>
      json(201, { room, player: { playerId: "p-hanako", playerToken: "token-hanako" } }),
    );
    await client.joinRoom("k7q2xm", { nickname: "はなこ" });
    await client.joinRoom("a/b", { nickname: "はなこ" });
    expect(calls[0]?.url).toBe("https://eshiritori.example/rooms/k7q2xm/members");
    expect(calls[0]?.init.body).toBe('{"nickname":"はなこ"}');
    expect(calls[1]?.url).toBe("https://eshiritori.example/rooms/a%2Fb/members");
  });

  it("部屋コードが空文字なら fetch を呼ばずに room.room_not_found", async () => {
    const { calls, client } = setup(() => json(201, {}));
    expect(await client.joinRoom("", { nickname: "はなこ" })).toEqual({
      ok: false,
      code: "room.room_not_found",
    });
    expect(calls).toHaveLength(0);
  });

  it("409 の room.room_full を失敗で返す", async () => {
    const { client } = setup(() => json(409, { code: "room.room_full", detail: "満員" }));
    expect(await client.joinRoom("K7Q2XM", { nickname: "はなこ" })).toEqual({
      ok: false,
      code: "room.room_full",
    });
  });
});

describe("getRoom", () => {
  it("GET /rooms/{部屋コード} に Bearer を付け、200 を成功で返す", async () => {
    const got = { room, playerId: "p-hanako" };
    const { calls, client } = setup(() => json(200, got));
    expect(await client.getRoom("K7Q2XM", "token-hanako")).toEqual({ ok: true, value: got });
    expect(calls[0]?.url).toBe("https://eshiritori.example/rooms/K7Q2XM");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "Bearer token-hanako" });
  });

  it("403 の room.not_member を失敗で返す", async () => {
    const { client } = setup(() =>
      json(403, { code: "room.not_member", detail: "メンバーでない" }),
    );
    expect(await client.getRoom("K7Q2XM", "token-x")).toEqual({
      ok: false,
      code: "room.not_member",
    });
  });
});

describe("startGame", () => {
  it("POST /rooms/{部屋コード}/start に Bearer を付け、200 を成功で返す", async () => {
    const { calls, client } = setup(() => json(200, { room }));
    expect(await client.startGame("K7Q2XM", "token-taro")).toEqual({ ok: true, value: { room } });
    expect(calls[0]?.url).toBe("https://eshiritori.example/rooms/K7Q2XM/start");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "Bearer token-taro" });
  });

  it("409 の room.not_enough_members を失敗で返す", async () => {
    const { client } = setup(() =>
      json(409, { code: "room.not_enough_members", detail: "人数が足りない" }),
    );
    expect(await client.startGame("K7Q2XM", "token-taro")).toEqual({
      ok: false,
      code: "room.not_enough_members",
    });
  });
});
