import type { components } from "@eshiritori/api-contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TestServer } from "./support/startServer";
import { startServer } from "./support/startServer";

type CreateRoomResponse = components["schemas"]["CreateRoomResponse"];
type ErrorResponse = components["schemas"]["ErrorResponse"];

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.close();
});

describe("POST /rooms", () => {
  it.each([1, 3])(
    "UC-01 要件 1: ニックネームと周回数を入れて部屋を作ると、作った人がホストとしてただ 1 人のメンバーになった部屋ができる（周回数 %i）",
    async (roundCount) => {
      // 前提: どの部屋にも入っていない
      // 操作: ニックネームと周回数を決めて部屋を作る
      const { status, body } = await server.postJson<CreateRoomResponse>("/rooms", {
        nickname: "たろう",
        roundCount,
      });

      // 期待: 部屋ができ、作った人がただ 1 人のホストとして返る。本人の資格は本人にだけ返り、部屋の情報には含まれない
      expect(status).toBe(201);
      expect(body.room.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(body.room.roundCount).toBe(roundCount);
      expect(body.room.members).toEqual([{ playerId: body.player.playerId, nickname: "たろう" }]);
      expect(body.room.hostPlayerId).toBe(body.player.playerId);
      expect(body.player.playerToken).not.toBe("");
      expect(JSON.stringify(body.room)).not.toContain(body.player.playerToken);
    },
  );

  it("UC-01 要件 1: 部屋を作るたびに別の部屋コードの部屋ができる", async () => {
    // 前提: どの部屋にも入っていない
    // 操作: 同じニックネーム・周回数で部屋を 2 回作る
    const first = await server.postJson<CreateRoomResponse>("/rooms", {
      nickname: "たろう",
      roundCount: 1,
    });
    const second = await server.postJson<CreateRoomResponse>("/rooms", {
      nickname: "たろう",
      roundCount: 1,
    });

    // 期待: 2 つの部屋は別の部屋コードになる
    expect(first.body.room.code).not.toBe(second.body.room.code);
  });

  it.each(["", "   "])(
    "UC-01 要件 4: ニックネームが空・空白だけのときは入力の誤りが返り、部屋は作られない（「%s」）",
    async (nickname) => {
      // 前提: どの部屋にも入っていない
      // 操作: ニックネームを空のまま部屋を作る
      const { status, body } = await server.postJson<ErrorResponse>("/rooms", {
        nickname,
        roundCount: 1,
      });

      // 期待: 入力の誤りが返り、部屋コードは返らない
      // 設計: 部屋の状態を読む API が無いので、部屋が作られないことは「部屋コードが返らない」までを見る。保存しないことは単体テストが守る
      expect(status).toBe(400);
      expect(body.code).toBe("room.nickname_empty");
      expect(body).not.toHaveProperty("room");
    },
  );

  it("UC-01 要件 4: ニックネームが前後の空白を除いて 10 文字を超えるときは入力の誤りが返り、部屋は作られない", async () => {
    // 前提: どの部屋にも入っていない
    // 操作: 前後の空白を除いて 11 文字のニックネームで部屋を作る
    const { status, body } = await server.postJson<ErrorResponse>("/rooms", {
      nickname: "じゅげむじゅげむごこう",
      roundCount: 1,
    });

    // 期待: 入力の誤りが返り、部屋コードは返らない
    expect(status).toBe(400);
    expect(body.code).toBe("room.nickname_too_long");
    expect(body).not.toHaveProperty("room");
  });

  it("UC-01 要件 4: 前後の空白を除いて 10 文字のニックネームなら部屋を作れる", async () => {
    // 前提: どの部屋にも入っていない
    // 操作: 前後に空白のある、空白を除くと 10 文字のニックネームで部屋を作る
    const { status, body } = await server.postJson<CreateRoomResponse>("/rooms", {
      nickname: "  じゅげむじゅげむご  ",
      roundCount: 1,
    });

    // 期待: 部屋ができ、ニックネームは前後の空白を除いた形で入る
    expect(status).toBe(201);
    expect(body.room.members[0]?.nickname).toBe("じゅげむじゅげむご");
  });

  it.each([0, 6, 2.5])(
    "UC-01 要件 5: 周回数が 1〜5 の整数でないときは入力の誤りが返り、部屋は作られない（%s）",
    async (roundCount) => {
      // 前提: どの部屋にも入っていない
      // 操作: 1〜5 の整数でない周回数で部屋を作る
      const { status, body } = await server.postJson<ErrorResponse>("/rooms", {
        nickname: "たろう",
        roundCount,
      });

      // 期待: 入力の誤りが返り、部屋コードは返らない
      expect(status).toBe(400);
      expect(body.code).toBe("room.round_count_out_of_range");
      expect(body).not.toHaveProperty("room");
    },
  );

  it.each([1, 5])("UC-01 要件 5: 周回数の境界の %i なら部屋を作れる", async (roundCount) => {
    // 前提: どの部屋にも入っていない
    // 操作: 周回数の境界の値で部屋を作る
    const { status, body } = await server.postJson<CreateRoomResponse>("/rooms", {
      nickname: "たろう",
      roundCount,
    });

    // 期待: 部屋ができ、その周回数になる
    expect(status).toBe(201);
    expect(body.room.roundCount).toBe(roundCount);
  });

  it.each([
    { label: "文字列", payload: { nickname: "たろう", roundCount: "3" } },
    { label: "欠落", payload: { nickname: "たろう" } },
  ])(
    "UC-01 要件 5: 周回数が数でない・無い要求は要求の形の誤りが返り、部屋は作られない（$label）",
    async ({ payload }) => {
      // 前提: どの部屋にも入っていない
      // 操作: 周回数が数でない、または無いまま部屋を作る
      const { status, body } = await server.postJson<ErrorResponse>("/rooms", payload);

      // 期待: 要求の形の誤りが返り、部屋コードは返らない
      expect(status).toBe(400);
      expect(body.code).toBe("request.invalid_body");
    },
  );

  it("UC-01 要件 4 / UC-01 要件 5: 本文が JSON として読めない要求は要求の形の誤りが返り、部屋は作られない", async () => {
    // 前提: どの部屋にも入っていない
    // 操作: JSON として読めない本文で部屋を作る
    const { status, body } = await server.postJson<ErrorResponse>("/rooms", "{not json");

    // 期待: 要求の形の誤りが返り、部屋コードは返らない
    expect(status).toBe(400);
    expect(body.code).toBe("request.invalid_json");
  });
});
