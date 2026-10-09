import type { components } from "@eshiritori/api-contract";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { RoomSocket } from "./support/connectWebSocket";
import { connectWebSocket } from "./support/connectWebSocket";
import type { SeededRoom } from "./support/seedRoom";
import { seedRoom } from "./support/seedRoom";
import type { TestServer } from "./support/startServer";
import { startServer } from "./support/startServer";

type StartGameResponse = components["schemas"]["StartGameResponse"];
type GetRoomResponse = components["schemas"]["GetRoomResponse"];
type ErrorResponse = components["schemas"]["ErrorResponse"];

const EIGHT = ["a", "b", "c", "d", "e", "f", "g", "h"];

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

/** 部屋のメンバーのトークンで、ゲームを始める。トークンが無ければ付けない。 */
function startGame(
  room: SeededRoom,
  playerToken: string | undefined,
): Promise<{ status: number; body: StartGameResponse & ErrorResponse }> {
  return server.postJson<StartGameResponse & ErrorResponse>(
    `/rooms/${room.code}/start`,
    undefined,
    playerToken,
  );
}

/** ホストのトークンで、部屋の状態を取る。 */
async function roomStateOf(room: SeededRoom): Promise<GetRoomResponse["room"]> {
  const { body } = await server.getJson<GetRoomResponse>(
    `/rooms/${room.code}`,
    room.members[0]?.playerToken,
  );
  return body.room;
}

function nicknamesOf(room: GetRoomResponse["room"]): string[] {
  return room.members.map((member) => member.nickname);
}

describe("POST /rooms/{roomCode}/start", () => {
  it("UC-03 要件 4: メンバーがホスト 1 人だけの部屋では開始できず、2 人以上で始められる旨が返る", async () => {
    // 前提: たろう 1 人の部屋
    const room = await seedRoom({ nicknames: ["たろう"] });

    // 操作: たろうが開始する
    const { status, body } = await startGame(room, room.members[0]?.playerToken);

    // 期待: 開始できず、ゲームは始まらない
    expect(status).toBe(409);
    expect(body.code).toBe("room.not_enough_members");
    expect((await roomStateOf(room)).status).toBe("waiting");
  });

  it("UC-03 要件 4: メンバーが 2 人いれば開始でき、ゲームが始まった部屋が返る", async () => {
    // 前提: たろうとはなこの部屋
    const room = await seedRoom({ nicknames: ["たろう", "はなこ"] });

    // 操作: たろうが開始する
    const { status, body } = await startGame(room, room.members[0]?.playerToken);

    // 期待: 始まった部屋が返り、はなこから見ても始まっている
    expect(status).toBe(200);
    expect(body.room.status).toBe("started");
    expect(nicknamesOf(body.room).sort()).toEqual(["たろう", "はなこ"]);
    const hanako = await server.getJson<GetRoomResponse>(
      `/rooms/${room.code}`,
      room.members[1]?.playerToken,
    );
    expect(hanako.body.room.status).toBe("started");
  });

  it("UC-03 要件 5: ホスト以外のメンバーからの開始の要求は受け付けず、ゲームは始まらない", async () => {
    // 前提: たろう、はなこ、じろうの部屋
    const room = await seedRoom({ nicknames: ["たろう", "はなこ", "じろう"] });

    // 操作: はなこが開始する
    const { status, body } = await startGame(room, room.members[1]?.playerToken);

    // 期待: 受け付けず、ゲームは始まらない
    expect(status).toBe(403);
    expect(body.code).toBe("room.not_host");
    expect((await roomStateOf(room)).status).toBe("waiting");
  });

  it("UC-03 要件 5: メンバーでない人からの開始の要求は受け付けず、ゲームは始まらない", async () => {
    // 前提: ほかの部屋のメンバーがいる。対象の部屋はたろうとはなこ
    const other = await seedRoom({ nicknames: ["さぶろう"] });
    const room = await seedRoom({ nicknames: ["たろう", "はなこ"] });

    for (const token of [other.members[0]?.playerToken, undefined]) {
      // 操作: 別の部屋のメンバーのトークン、またはトークン無しで開始する
      const { status, body } = await startGame(room, token);

      // 期待: 受け付けず、ゲームは始まらない
      expect(status).toBe(403);
      expect(body.code).toBe("room.not_host");
    }
    expect((await roomStateOf(room)).status).toBe("waiting");
  });

  it("UC-03 要件 6: 既にゲームが始まった部屋への開始の要求は無視され、描く順番は決め直されず、エラーも返らない", async () => {
    // 前提: 8 人で始まっている部屋（members の並びが描く順番）
    const room = await seedRoom({ nicknames: EIGHT, status: "started" });

    // 操作: ホストが開始する
    const { status, body } = await startGame(room, room.members[0]?.playerToken);

    // 期待: 200 で、並びは書いたまま
    expect(status).toBe(200);
    expect(nicknamesOf(body.room)).toEqual(EIGHT);
    expect(nicknamesOf(await roomStateOf(room))).toEqual(EIGHT);
  });

  it("UC-03 要件 6: ホストが開始を 2 回続けて送っても、2 回目は一度目と同じ描く順番を返し、エラーも返らない", async () => {
    // 前提: 8 人の待機中の部屋
    const room = await seedRoom({ nicknames: EIGHT });
    const token = room.members[0]?.playerToken;

    // 操作: ホストが 2 回続けて開始する
    const first = await startGame(room, token);
    const second = await startGame(room, token);

    // 期待: どちらも 200 で、同じ並び
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(nicknamesOf(second.body.room)).toEqual(nicknamesOf(first.body.room));
    expect(nicknamesOf(await roomStateOf(room))).toEqual(nicknamesOf(first.body.room));
  });

  it("UC-03 要件 6: 開始の要求がほぼ同時に 2 回届いても、描く順番は 1 つに決まり、どちらにもエラーが返らない", async () => {
    // 前提: 8 人の待機中の部屋
    const room = await seedRoom({ nicknames: EIGHT });
    const token = room.members[0]?.playerToken;

    // 操作: ホストの開始が同時に 2 つ届く
    const [a, b] = await Promise.all([startGame(room, token), startGame(room, token)]);

    // 期待: どちらも 200 で、並びがすべて同じ
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(nicknamesOf(b.body.room)).toEqual(nicknamesOf(a.body.room));
    expect(nicknamesOf(await roomStateOf(room))).toEqual(nicknamesOf(a.body.room));
  });
});

describe("WebSocket の通知", () => {
  it("UC-03 要件 2 / UC-03 要件 3: ホストが始めると、メンバー全員にゲームが始まった部屋が 1 秒以内に届き、描く順番の並びが全員で同じになる", async () => {
    // 前提: たろう、はなこ、じろうの待機室で、3 人とも通知を受けられる
    const room = await seedRoom({ nicknames: ["たろう", "はなこ", "じろう"] });
    const sockets = await Promise.all(
      room.members.map((member) => connect(room.code, member.playerToken)),
    );

    // 操作: たろうが開始する
    // 1 秒は操作の直前から数える（待ちを先に始める）
    const pending = Promise.all(sockets.map((socket) => socket.next(1000)));
    const started = await startGame(room, room.members[0]?.playerToken);
    const notifications = await pending;

    // 期待: 3 人とも game_started で始まった部屋を受け取り、並びが開始の応答と同じ
    expect(started.status).toBe(200);
    for (const notification of notifications) {
      expect(notification.type).toBe("game_started");
      expect(notification.room.status).toBe("started");
      expect(nicknamesOf(notification.room)).toEqual(nicknamesOf(started.body.room));
    }
  });

  it("UC-03 要件 2: 始められなかった要求では届かず、その後に始まった通知だけが届く", async () => {
    // 前提: たろうとはなこの待機室で、はなこが通知を受けられる
    const room = await seedRoom({ nicknames: ["たろう", "はなこ"] });
    const hanako = await connect(room.code, room.members[1]?.playerToken ?? "");

    // 操作: はなこが開始して断られ、その後にたろうが開始する
    const rejected = await startGame(room, room.members[1]?.playerToken);
    await startGame(room, room.members[0]?.playerToken);
    const notification = await hanako.next(1000);

    // 期待: 最初に届く通知は game_started（断られた要求の通知は無い）
    expect(rejected.status).toBe(403);
    expect(notification.type).toBe("game_started");
  });
});
