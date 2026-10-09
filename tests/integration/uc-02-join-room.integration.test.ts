import type { components } from "@eshiritori/api-contract";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { RoomSocket } from "./support/connectWebSocket";
import { connectWebSocket } from "./support/connectWebSocket";
import type { SeededRoom } from "./support/seedRoom";
import { seedRoom } from "./support/seedRoom";
import type { TestServer } from "./support/startServer";
import { startServer } from "./support/startServer";

type CreateRoomResponse = components["schemas"]["CreateRoomResponse"];
type JoinRoomResponse = components["schemas"]["JoinRoomResponse"];
type GetRoomResponse = components["schemas"]["GetRoomResponse"];
type ErrorResponse = components["schemas"]["ErrorResponse"];

const HOUR = 60 * 60 * 1000;

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.close();
});

const openSockets: RoomSocket[] = [];

afterEach(() => {
  for (const socket of openSockets.splice(0)) {
    socket.close();
  }
});

/** 部屋のメンバーとして通知の接続を開く。テストの後に閉じる。 */
async function connect(roomCode: string, playerToken: string): Promise<RoomSocket> {
  const socket = await connectWebSocket(server.baseUrl, roomCode, playerToken);
  openSockets.push(socket);
  return socket;
}

/** API で部屋を作る。 */
async function createRoom(nickname = "たろう"): Promise<CreateRoomResponse> {
  const { body } = await server.postJson<CreateRoomResponse>("/rooms", { nickname, roundCount: 1 });
  return body;
}

/** API で部屋に入る。 */
function joinRoom(
  code: string,
  nickname: string,
): Promise<{ status: number; body: JoinRoomResponse }> {
  return server.postJson<JoinRoomResponse>(`/rooms/${code}/members`, { nickname });
}

/** 前提の部屋のホストのトークンで、部屋のメンバーのニックネームの一覧を取る。 */
async function nicknamesOf(room: SeededRoom): Promise<string[]> {
  const host = room.members[0];
  const { body } = await server.getJson<GetRoomResponse>(`/rooms/${room.code}`, host?.playerToken);
  return body.room.members.map((member) => member.nickname);
}

describe("POST /rooms/{roomCode}/members", () => {
  it("UC-02 要件 2: 部屋コードの部屋に入れる状態なら、ニックネームでメンバーに加わり、加わった部屋が返る", async () => {
    // 前提: たろうが部屋を作っている
    const created = await createRoom("たろう");

    // 操作: はなこが部屋コードの部屋にニックネームを入れて入る
    const { status, body } = await joinRoom(created.room.code, "はなこ");

    // 期待: メンバーに加わり、たろうに続いてはなこが並ぶ。ホストはたろうのまま。本人の資格は部屋の情報に含まれない
    expect(status).toBe(201);
    expect(body.room.members.map((member) => member.nickname)).toEqual(["たろう", "はなこ"]);
    expect(body.room.hostPlayerId).toBe(created.player.playerId);
    expect(body.room.members[1]?.playerId).toBe(body.player.playerId);
    expect(body.player.playerToken).not.toBe("");
    expect(JSON.stringify(body.room)).not.toContain(body.player.playerToken);
  });

  it("UC-02 要件 2: 加わったメンバーは、自分のトークンで部屋の状態を取れる", async () => {
    // 前提: たろうが部屋を作り、はなこ、じろうが順に入っている
    const created = await createRoom("たろう");
    const hanako = await joinRoom(created.room.code, "はなこ");
    await joinRoom(created.room.code, "じろう");

    // 操作: はなこが自分のトークンで部屋の状態を取る
    const { status, body } = await server.getJson<GetRoomResponse>(
      `/rooms/${created.room.code}`,
      hanako.body.player.playerToken,
    );

    // 期待: 3 人が入った順に並び、自分の識別子が返る
    expect(status).toBe(200);
    expect(body.room.members.map((member) => member.nickname)).toEqual([
      "たろう",
      "はなこ",
      "じろう",
    ]);
    expect(body.playerId).toBe(hanako.body.player.playerId);
  });

  it("UC-02 要件 2: 部屋コードの大文字小文字の違いがあっても入れる", async () => {
    // 前提: たろうが部屋を作っている
    const created = await createRoom();

    // 操作: 部屋コードを小文字にして入る
    const { status, body } = await joinRoom(created.room.code.toLowerCase(), "はなこ");

    // 期待: メンバーに加わる
    expect(status).toBe(201);
    expect(body.room.code).toBe(created.room.code);
  });

  it.each([
    { label: "別の部屋のメンバーのトークン", other: true },
    { label: "トークン無し", other: false },
  ])("UC-02 要件 2: メンバーでない人は、部屋の状態を取れない（$label）", async ({ other }) => {
    // 前提: 部屋と、別の部屋がある
    const created = await createRoom();
    const another = await createRoom("さぶろう");

    // 操作: 部屋のメンバーでない人が部屋の状態を取る
    const { status, body } = await server.getJson<ErrorResponse>(
      `/rooms/${created.room.code}`,
      other ? another.player.playerToken : undefined,
    );

    // 期待: メンバーでない旨が返る
    expect(status).toBe(403);
    expect(body.code).toBe("room.not_member");
  });

  it.each(["ZZZZZZ", "ABC"])(
    "UC-02 要件 4: 部屋コードの部屋が無いときは見つからない旨が返り、メンバーに加わらない（%s）",
    async (code) => {
      // 前提: その部屋コードの部屋は無い
      // 操作: その部屋コードで入る
      const { status, body } = await server.postJson<ErrorResponse>(`/rooms/${code}/members`, {
        nickname: "はなこ",
      });

      // 期待: 見つからない旨が返る
      expect(status).toBe(404);
      expect(body.code).toBe("room.room_not_found");
    },
  );

  it("UC-02 要件 5: 最後の更新から 24 時間たった部屋には入れず、見つからない旨が返る", async () => {
    // 前提: 最後の更新から 24 時間 1 分たった部屋がある
    const room = await seedRoom({
      nicknames: ["たろう"],
      lastUpdatedAt: new Date(Date.now() - 24 * HOUR - 60 * 1000),
    });

    // 操作: その部屋に入る
    const { status, body } = await server.postJson<ErrorResponse>(`/rooms/${room.code}/members`, {
      nickname: "はなこ",
    });

    // 期待: 見つからない旨が返る
    expect(status).toBe(404);
    expect(body.code).toBe("room.room_not_found");
  });

  it("UC-02 要件 5: 最後の更新から 24 時間たった部屋は、メンバーのトークンでも状態を取れず、見つからない旨が返る", async () => {
    // 前提: 最後の更新から 24 時間 1 分たった部屋がある
    const room = await seedRoom({
      nicknames: ["たろう"],
      lastUpdatedAt: new Date(Date.now() - 24 * HOUR - 60 * 1000),
    });

    // 操作: ホストのトークンで部屋の状態を取る
    const { status, body } = await server.getJson<ErrorResponse>(
      `/rooms/${room.code}`,
      room.members[0]?.playerToken,
    );

    // 期待: 見つからない旨が返る
    expect(status).toBe(404);
    expect(body.code).toBe("room.room_not_found");
  });

  it("UC-02 要件 5: 最後の更新から 24 時間たっていない部屋には入れる", async () => {
    // 前提: 最後の更新から 23 時間たった部屋がある
    const room = await seedRoom({
      nicknames: ["たろう"],
      lastUpdatedAt: new Date(Date.now() - 23 * HOUR),
    });

    // 操作: その部屋に入る
    const { status } = await joinRoom(room.code, "はなこ");

    // 期待: メンバーに加わる
    expect(status).toBe(201);
  });

  it("UC-02 要件 6: メンバーが 8 人いる部屋には満員の旨が返り、メンバーに加わらない", async () => {
    // 前提: メンバーが 8 人いる部屋がある
    const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const room = await seedRoom({ nicknames: names });

    // 操作: その部屋に入る
    const { status, body } = await server.postJson<ErrorResponse>(`/rooms/${room.code}/members`, {
      nickname: "はなこ",
    });

    // 期待: 満員の旨が返り、メンバーは 8 人のまま
    expect(status).toBe(409);
    expect(body.code).toBe("room.room_full");
    expect(await nicknamesOf(room)).toEqual(names);
  });

  it("UC-02 要件 6: 7 人の部屋に 2 人がほぼ同時に入ろうとすると、1 人だけが加わり、もう 1 人には満員の旨が返る", async () => {
    // 前提: メンバーが 7 人いる部屋がある
    const room = await seedRoom({ nicknames: ["a", "b", "c", "d", "e", "f", "g"] });

    // 操作: 2 人がほぼ同時に入る
    const [first, second] = await Promise.all([
      server.postJson<JoinRoomResponse & ErrorResponse>(`/rooms/${room.code}/members`, {
        nickname: "はなこ",
      }),
      server.postJson<JoinRoomResponse & ErrorResponse>(`/rooms/${room.code}/members`, {
        nickname: "じろう",
      }),
    ]);

    // 期待: 1 人だけが加わり、もう 1 人には満員の旨が返る。メンバーは 8 人で、加わったのは成功を受けた側
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const loser = first.status === 409 ? first : second;
    expect(loser.body.code).toBe("room.room_full");
    const members = await nicknamesOf(room);
    expect(members).toHaveLength(8);
    const winnerName = first.status === 201 ? "はなこ" : "じろう";
    const loserName = first.status === 201 ? "じろう" : "はなこ";
    expect(members).toContain(winnerName);
    expect(members).not.toContain(loserName);
  });

  it("UC-02 要件 7: ゲームが始まった部屋には、ゲーム中の旨が返り、メンバーに加わらない", async () => {
    // 前提: ゲームが始まった 3 人の部屋がある
    const room = await seedRoom({ nicknames: ["a", "b", "c"], status: "started" });

    // 操作: その部屋に入る
    const { status, body } = await server.postJson<ErrorResponse>(`/rooms/${room.code}/members`, {
      nickname: "はなこ",
    });

    // 期待: ゲーム中の旨が返り、メンバーは 3 人のまま
    expect(status).toBe(409);
    expect(body.code).toBe("room.game_already_started");
    expect(await nicknamesOf(room)).toEqual(["a", "b", "c"]);
  });

  it.each(["はなこ", " はなこ "])(
    "UC-02 要件 8: 同じニックネームのメンバーがいるときは別のニックネームを求める旨が返り、メンバーに加わらない（「%s」）",
    async (nickname) => {
      // 前提: たろうとはなこがいる部屋がある
      const room = await seedRoom({ nicknames: ["たろう", "はなこ"] });

      // 操作: 同じニックネームで入る
      const { status, body } = await server.postJson<ErrorResponse>(`/rooms/${room.code}/members`, {
        nickname,
      });

      // 期待: ニックネームが使われている旨が返り、メンバーは 2 人のまま
      expect(status).toBe(409);
      expect(body.code).toBe("room.nickname_taken");
      expect(await nicknamesOf(room)).toEqual(["たろう", "はなこ"]);
    },
  );

  it("UC-02 要件 8: ひらがなとカタカナの違うニックネームは別のニックネームとして入れる", async () => {
    // 前提: はなこがいる部屋がある
    const room = await seedRoom({ nicknames: ["はなこ"] });

    // 操作: カタカナのハナコで入る
    const { status } = await joinRoom(room.code, "ハナコ");

    // 期待: メンバーに加わる
    expect(status).toBe(201);
  });

  it.each(["", "   "])(
    "UC-02 要件 9: ニックネームが空・空白だけのときは入力の誤りが返り、メンバーに加わらない（「%s」）",
    async (nickname) => {
      // 前提: 入れる部屋がある
      const room = await seedRoom({ nicknames: ["たろう"] });

      // 操作: ニックネームを空のまま入る
      const { status, body } = await server.postJson<ErrorResponse>(`/rooms/${room.code}/members`, {
        nickname,
      });

      // 期待: 入力の誤りが返り、メンバーは増えない
      expect(status).toBe(400);
      expect(body.code).toBe("room.nickname_empty");
      expect(await nicknamesOf(room)).toEqual(["たろう"]);
    },
  );

  it("UC-02 要件 9: ニックネームが前後の空白を除いて 10 文字を超えるときは入力の誤りが返り、メンバーに加わらない", async () => {
    // 前提: 入れる部屋がある
    const room = await seedRoom({ nicknames: ["たろう"] });

    // 操作: 11 文字のニックネームで入る
    const { status, body } = await server.postJson<ErrorResponse>(`/rooms/${room.code}/members`, {
      nickname: "じゅげむじゅげむごこう",
    });

    // 期待: 入力の誤りが返り、メンバーは増えない
    expect(status).toBe(400);
    expect(body.code).toBe("room.nickname_too_long");
    expect(await nicknamesOf(room)).toEqual(["たろう"]);
  });

  it("UC-02 要件 9: 前後の空白を除いて 10 文字のニックネームなら入れる", async () => {
    // 前提: 入れる部屋がある
    const room = await seedRoom({ nicknames: ["たろう"] });

    // 操作: 前後に空白のある、空白を除くと 10 文字のニックネームで入る
    const { status, body } = await joinRoom(room.code, "  じゅげむじゅげむご  ");

    // 期待: 空白を除いた名前で加わる
    expect(status).toBe(201);
    expect(body.room.members[1]?.nickname).toBe("じゅげむじゅげむご");
  });

  it.each([
    { label: "JSON でない", payload: "{not json", code: "request.invalid_json" },
    { label: "ニックネームが文字列でない", payload: { nickname: 1 }, code: "request.invalid_body" },
  ])(
    "UC-02 要件 9: 本文が JSON として読めない・ニックネームが文字列でない要求は要求の形の誤りが返り、メンバーに加わらない（$label）",
    async ({ payload, code }) => {
      // 前提: 入れる部屋がある
      const room = await seedRoom({ nicknames: ["たろう"] });

      // 操作: 形の誤った要求で入る
      const { status, body } = await server.postJson<ErrorResponse>(
        `/rooms/${room.code}/members`,
        payload,
      );

      // 期待: 要求の形の誤りが返り、メンバーは増えない
      expect(status).toBe(400);
      expect(body.code).toBe(code);
      expect(await nicknamesOf(room)).toEqual(["たろう"]);
    },
  );
});

describe("WebSocket の通知", () => {
  it("UC-02 要件 3: 待機室にいるメンバー全員に、加わったメンバーを含む一覧が 1 秒以内に届く", async () => {
    // 前提: たろうとはなこが待機室にいて、2 人とも通知を受けられる
    const room = await seedRoom({ nicknames: ["たろう", "はなこ"] });
    const [taro, hanako] = await Promise.all(
      room.members.map((member) => connect(room.code, member.playerToken)),
    );

    // 操作: じろうが部屋コードで入る
    // 1 秒は操作の直前から数える（待ちを先に始める）
    const pending = Promise.all([taro?.next(1000), hanako?.next(1000)]);
    const joined = await joinRoom(room.code, "じろう");
    const [forTaro, forHanako] = await pending;

    // 期待: 2 人とも、じろうを含む 3 人の一覧を member_joined で受け取る
    expect(joined.status).toBe(201);
    for (const notification of [forTaro, forHanako]) {
      expect(notification?.type).toBe("member_joined");
      expect(notification?.room.members.map((member) => member.nickname)).toEqual([
        "たろう",
        "はなこ",
        "じろう",
      ]);
    }
  });

  it("UC-02 要件 3: 届く一覧にはプレイヤートークンが含まれない", async () => {
    // 前提: たろうが待機室で通知を受けられる
    const room = await seedRoom({ nicknames: ["たろう", "はなこ"] });
    const taro = await connect(room.code, room.members[0]?.playerToken ?? "");

    // 操作: じろうが入り、たろうが一覧を受け取る
    const joined = await joinRoom(room.code, "じろう");
    const notification = await taro.next(1000);

    // 期待: 受け取った本文に、どのメンバーのトークンも含まれない
    const serialized = JSON.stringify([taro.connected, notification]);
    for (const token of [
      ...room.members.map((member) => member.playerToken),
      joined.body.player.playerToken,
    ]) {
      expect(serialized).not.toContain(token);
    }
  });

  it("UC-02 要件 3: 入れなかった要求では一覧は届かず、その後に入れた要求の一覧だけが届く", async () => {
    // 前提: たろうが待機室で通知を受けられる
    const room = await seedRoom({ nicknames: ["たろう"] });
    const taro = await connect(room.code, room.members[0]?.playerToken ?? "");

    // 操作: 名前が重複して入れず、その後に別の名前で入る
    const rejected = await joinRoom(room.code, "たろう");
    await joinRoom(room.code, "はなこ");
    const notification = await taro.next(1000);

    // 期待: 最初に届く通知は、入れた後の一覧（入れなかった要求の通知は無い）
    expect(rejected.status).toBe(409);
    expect(notification.type).toBe("member_joined");
    expect(notification.room.members.map((member) => member.nickname)).toEqual([
      "たろう",
      "はなこ",
    ]);
  });

  it("UC-02 要件 3: 部屋のメンバーでない人は、通知を受ける接続ができない", async () => {
    // 前提: ほかの部屋のメンバーがいる。対象の部屋はたろうだけ
    const other = await seedRoom({ nicknames: ["さぶろう"] });
    const room = await seedRoom({ nicknames: ["たろう"] });

    // 操作: ほかの部屋のトークン、トークン無し、無い部屋コードで接続しようとする
    // 期待: どれも接続できない
    await expect(connect(room.code, other.members[0]?.playerToken ?? "")).rejects.toThrow();
    await expect(connect(room.code, "")).rejects.toThrow();
    await expect(connect("ZZZZZZ", room.members[0]?.playerToken ?? "")).rejects.toThrow();
  });

  it("UC-02 要件 3: 接続した直後に、いまのメンバー一覧が届く", async () => {
    // 前提: たろうとはなこの部屋
    const room = await seedRoom({ nicknames: ["たろう", "はなこ"] });

    // 操作: はなこが部屋コードを小文字にして接続する
    const hanako = await connect(room.code.toLowerCase(), room.members[1]?.playerToken ?? "");

    // 期待: 接続直後の connected で、いまの 2 人の一覧が届く
    expect(hanako.connected.type).toBe("connected");
    expect(hanako.connected.room.members.map((member) => member.nickname)).toEqual([
      "たろう",
      "はなこ",
    ]);
    // 小文字で接続しても、その後の通知が届く（正規化した部屋コードで登録されている）
    await joinRoom(room.code, "じろう");
    expect((await hanako.next(1000)).type).toBe("member_joined");
  });
});
