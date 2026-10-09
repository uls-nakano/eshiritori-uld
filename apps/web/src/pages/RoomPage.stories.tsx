import type { components } from "@eshiritori/api-contract";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { act } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { ApiClient, ApiResult } from "../api/apiClient";
import type { RoomNotification } from "../api/roomSocket";
import { createPlayerTokenStore } from "../storage/playerTokenStore";
import { RoomPage } from "./RoomPage";

type RoomSnapshot = components["schemas"]["RoomSnapshot"];
type Schemas = components["schemas"];

const taro = { playerId: "p-taro", nickname: "たろう" };
const hanako = { playerId: "p-hanako", nickname: "はなこ" };
const jiro = { playerId: "p-jiro", nickname: "じろう" };

const roomOf = (
  members: RoomSnapshot["members"],
  status: RoomSnapshot["status"] = "waiting",
): RoomSnapshot => ({
  code: "K7Q2XM",
  roundCount: 1,
  hostPlayerId: taro.playerId,
  status,
  members,
});

const failure = <T,>(code: string): ApiResult<T> => ({ ok: false, code });
const success = <T,>(value: T): ApiResult<T> => ({ ok: true, value });
const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

/** 偽の記憶域。saved に渡した部屋のトークンを最初から持つ。 */
const tokenStoreWith = (saved: Record<string, string> = {}) => {
  const initial = Object.entries(saved).map(
    ([code, token]) => [`eshiritori.playerToken.${code}`, token] as const,
  );
  const map = new Map<string, string>(initial);
  const store = createPlayerTokenStore({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  });
  /** story の描画のたびに最初の状態へ戻す（story 同士・再描画で汚し合わない）。 */
  const reset = (): void => {
    map.clear();
    for (const [key, token] of initial) map.set(key, token);
  };
  return { store, reset };
};

/** 偽の通知の接続。onNotification を取っておき、play から通知を流せるようにする。 */
const socketStub = () => {
  let listener: ((notification: RoomNotification) => void) | undefined;
  const close = fn();
  const connectSocket = fn(
    (params: { onNotification: (notification: RoomNotification) => void }) => {
      listener = params.onNotification;
      return { close };
    },
  );
  const push = async (notification: RoomNotification): Promise<void> => {
    await act(async () => {
      listener?.(notification);
      await Promise.resolve();
    });
  };
  return { connectSocket, close, push };
};

const apiStub = (overrides: Partial<ApiClient> = {}) => ({
  createRoom: fn<ApiClient["createRoom"]>(() => never()),
  joinRoom: fn<ApiClient["joinRoom"]>(() =>
    Promise.resolve(failure<Schemas["JoinRoomResponse"]>("server.internal_error")),
  ),
  getRoom: fn<ApiClient["getRoom"]>(() => never()),
  startGame: fn<ApiClient["startGame"]>(() => never()),
  ...overrides,
});

/** story の部品一式。args に渡す偽物と、描画ごとに戻す reset を持つ。 */
const fixtureOf = (saved: Record<string, string>, overrides: Partial<ApiClient> = {}) => {
  const socket = socketStub();
  const api = apiStub(overrides);
  const tokens = tokenStoreWith(saved);
  return {
    socket,
    api,
    reset: tokens.reset,
    args: { api, tokenStore: tokens.store, connectSocket: socket.connectSocket },
  };
};

const meta = {
  title: "部屋のページ",
  component: RoomPage,
  args: {
    roomCode: "K7Q2XM",
    appOrigin: "https://eshiritori.example",
    copyText: () => Promise.resolve(),
  },
} satisfies Meta<typeof RoomPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const memberNames = (canvasElement: HTMLElement, listName: string): string[] =>
  within(within(canvasElement).getByRole("list", { name: listName }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

const waitingArgs = (
  viewer: typeof taro,
  token: string,
  members: RoomSnapshot["members"],
  extra: Partial<ApiClient> = {},
) =>
  fixtureOf(
    { K7Q2XM: token },
    {
      getRoom: fn<ApiClient["getRoom"]>(() =>
        Promise.resolve(success({ room: roomOf(members), playerId: viewer.playerId })),
      ),
      ...extra,
    },
  );

const invitedUrlOpenedFixture = fixtureOf({});

export const InvitedUrlOpened: Story = {
  name: "招待 URL を開いた",
  args: invitedUrlOpenedFixture.args,
  beforeEach: invitedUrlOpenedFixture.reset,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 1: 招待 URL を開くと、その部屋の部屋コードが入力済みの参加画面が表示される
    await expect(canvas.getByText("部屋コード: K7Q2XM")).toBeVisible();
    await expect(canvas.queryByLabelText("部屋コード")).toBeNull();
    await expect(canvas.getByLabelText("ニックネーム")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "入る" })).toBeEnabled();
    await expect(args.api.getRoom).not.toHaveBeenCalled();
    await expect(args.connectSocket).not.toHaveBeenCalled();
  },
};

const joinFromInvitedUrlFixture = fixtureOf(
  {},
  {
    joinRoom: fn<ApiClient["joinRoom"]>(() =>
      Promise.resolve(
        success({
          room: roomOf([taro, hanako]),
          player: { playerId: hanako.playerId, playerToken: "token-hanako" },
        }),
      ),
    ),
  },
);

export const JoinFromInvitedUrl: Story = {
  name: "招待 URL から入る",
  args: joinFromInvitedUrlFixture.args,
  beforeEach: joinFromInvitedUrlFixture.reset,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("ニックネーム"), "はなこ");
    await userEvent.click(canvas.getByRole("button", { name: "入る" }));
    // UC-02 要件 1 / UC-02 要件 2: 招待 URL の部屋に、ニックネームだけで入れる
    await waitFor(async () => {
      await expect(memberNames(canvasElement, "メンバー（2/8）")).toEqual([
        "たろう（ホスト）",
        "はなこ（あなた）",
      ]);
    });
    await expect(args.api.joinRoom).toHaveBeenCalledTimes(1);
    await expect(args.api.joinRoom).toHaveBeenCalledWith("K7Q2XM", { nickname: "はなこ" });
    await expect(args.tokenStore.load("K7Q2XM")).toBe("token-hanako");
    await expect(args.connectSocket).toHaveBeenCalledWith(
      expect.objectContaining({ roomCode: "K7Q2XM", playerToken: "token-hanako" }),
    );
  },
};

const joinRejectedFixture = fixtureOf(
  {},
  { joinRoom: fn<ApiClient["joinRoom"]>(() => Promise.resolve(failure("room.nickname_taken"))) },
);

export const JoinRejected: Story = {
  name: "招待 URL から入れなかった",
  args: joinRejectedFixture.args,
  beforeEach: joinRejectedFixture.reset,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("ニックネーム"), "たろう");
    await userEvent.click(canvas.getByRole("button", { name: "入る" }));
    await expect(
      await canvas.findByText("同じニックネームの人がいます。別のニックネームにしてください"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("ニックネーム")).toBeVisible();
    await expect(args.tokenStore.load("K7Q2XM")).toBeUndefined();
  },
};

const reopened = waitingArgs(hanako, "token-hanako", [taro, hanako]);

export const ReopenedWithSavedToken: Story = {
  name: "トークンを保存済みのブラウザで開き直した",
  args: reopened.args,
  beforeEach: reopened.reset,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 10: 参加画面を出さず、同じメンバーとしてその部屋の待機室が表示される
    await waitFor(async () => {
      await expect(memberNames(canvasElement, "メンバー（2/8）")).toEqual([
        "たろう（ホスト）",
        "はなこ（あなた）",
      ]);
    });
    await expect(args.api.getRoom).toHaveBeenCalledWith("K7Q2XM", "token-hanako");
    await expect(canvas.queryByLabelText("ニックネーム")).toBeNull();
    await expect(args.api.joinRoom).not.toHaveBeenCalled();
  },
};

const loadingFixture = fixtureOf({ K7Q2XM: "token-hanako" });

export const Loading: Story = {
  name: "読み込み中",
  args: loadingFixture.args,
  beforeEach: loadingFixture.reset,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("読み込み中…")).toBeVisible();
    await expect(canvas.queryByLabelText("ニックネーム")).toBeNull();
    await expect(canvas.queryByText("待機室")).toBeNull();
  },
};

const savedRoomNotFoundFixture = fixtureOf(
  { K7Q2XM: "token-hanako" },
  { getRoom: fn<ApiClient["getRoom"]>(() => Promise.resolve(failure("room.room_not_found"))) },
);

export const SavedRoomNotFound: Story = {
  name: "保存済みの部屋が見つからない",
  args: savedRoomNotFoundFixture.args,
  beforeEach: savedRoomNotFoundFixture.reset,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 5: 部屋が無い・期限切れの場合は、部屋が見つからない旨が表示される
    await expect(await canvas.findByText("部屋が見つかりません")).toBeVisible();
    await expect(canvas.getByLabelText("ニックネーム")).toBeVisible();
    await expect(args.tokenStore.load("K7Q2XM")).toBeUndefined();
  },
};

const savedTokenNotMemberFixture = fixtureOf(
  { K7Q2XM: "token-old" },
  { getRoom: fn<ApiClient["getRoom"]>(() => Promise.resolve(failure("room.not_member"))) },
);

export const SavedTokenNotMember: Story = {
  name: "保存済みのトークンがメンバーでない",
  args: savedTokenNotMemberFixture.args,
  beforeEach: savedTokenNotMemberFixture.reset,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("ニックネーム")).toBeVisible();
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(args.tokenStore.load("K7Q2XM")).toBeUndefined();
  },
};

const unavailableFixture = fixtureOf(
  { K7Q2XM: "token-hanako" },
  { getRoom: fn<ApiClient["getRoom"]>(() => Promise.resolve(failure("network.unreachable"))) },
);

export const Unavailable: Story = {
  name: "読み込めない",
  args: unavailableFixture.args,
  beforeEach: unavailableFixture.reset,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "うまくいきませんでした。時間をおいてもう一度試してください",
    );
    await expect(canvas.queryByLabelText("ニックネーム")).toBeNull();
  },
};

const memberJoined = waitingArgs(taro, "token-taro", [taro, hanako]);

export const MemberJoins: Story = {
  name: "メンバーが加わる",
  args: memberJoined.args,
  beforeEach: memberJoined.reset,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("メンバー（2/8）");
    await memberJoined.socket.push({ type: "member_joined", room: roomOf([taro, hanako, jiro]) });
    // UC-02 要件 3: 待機室にいるメンバーのメンバー一覧に、再読み込みなしに新しいメンバーが表示される
    await waitFor(async () => {
      await expect(memberNames(canvasElement, "メンバー（3/8）")).toEqual([
        "たろう（ホスト・あなた）",
        "はなこ",
        "じろう",
      ]);
    });
  },
};

const gameStarts = waitingArgs(hanako, "token-hanako", [taro, hanako, jiro]);

export const GameStarts: Story = {
  name: "ゲームが始まる",
  args: gameStarts.args,
  beforeEach: gameStarts.reset,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("メンバー（3/8）");
    await gameStarts.socket.push({
      type: "game_started",
      room: roomOf([jiro, taro, hanako], "started"),
    });
    // UC-03 要件 2: ホスト以外の画面も、ゲームが始まった旨と描く順番に切り替わる
    await expect(await canvas.findByText("ゲームが始まりました")).toBeVisible();
    await expect(
      within(canvas.getByRole("list", { name: "描く順番" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["じろう", "たろう", "はなこ（あなた）"]);
  },
};

const hostStarts = waitingArgs(taro, "token-taro", [taro, hanako], {
  startGame: fn<ApiClient["startGame"]>(() =>
    Promise.resolve(success({ room: roomOf([hanako, taro], "started") })),
  ),
});

export const HostStarts: Story = {
  name: "ホストが開始する",
  args: hostStarts.args,
  beforeEach: hostStarts.reset,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "開始" }));
    await expect(await canvas.findByText("ゲームが始まりました")).toBeVisible();
    await expect(args.api.startGame).toHaveBeenCalledWith("K7Q2XM", "token-taro");
  },
};

const startError = waitingArgs(taro, "token-taro", [taro], {
  startGame: fn<ApiClient["startGame"]>(() => Promise.resolve(failure("room.not_enough_members"))),
});

export const StartErrorClearedByJoin: Story = {
  name: "開始の誤りが人数の変化で消える",
  args: startError.args,
  beforeEach: startError.reset,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "開始" }));
    await expect(await canvas.findByText("2 人以上で始められます")).toBeVisible();
    await startError.socket.push({ type: "member_joined", room: roomOf([taro, hanako]) });
    await waitFor(async () => {
      await expect(canvas.queryByText("2 人以上で始められます")).toBeNull();
    });
  },
};
