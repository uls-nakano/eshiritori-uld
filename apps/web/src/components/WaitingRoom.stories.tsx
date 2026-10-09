import type { components } from "@eshiritori/api-contract";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { WaitingRoom } from "./WaitingRoom";

type RoomSnapshot = components["schemas"]["RoomSnapshot"];

const taro = { playerId: "p-taro", nickname: "たろう" };
const hanako = { playerId: "p-hanako", nickname: "はなこ" };
const jiro = { playerId: "p-jiro", nickname: "じろう" };

const roomOf = (members: RoomSnapshot["members"]): RoomSnapshot => ({
  code: "K7Q2XM",
  roundCount: 1,
  hostPlayerId: taro.playerId,
  status: "waiting",
  members,
});

const meta = {
  title: "待機室",
  component: WaitingRoom,
  args: {
    room: roomOf([taro]),
    viewerPlayerId: taro.playerId,
    appOrigin: "https://eshiritori.example",
    onStart: fn(),
    onCopyInviteUrl: fn(),
  },
} satisfies Meta<typeof WaitingRoom>;

export default meta;
type Story = StoryObj<typeof meta>;

const memberNames = (canvasElement: HTMLElement, listName: string): string[] =>
  within(within(canvasElement).getByRole("list", { name: listName }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

export const HostAlone: Story = {
  name: "ホストが 1 人で待っている",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-01 要件 2: 部屋コードと、その部屋に直接入れる招待 URL を表示する
    await expect(canvas.getByText("部屋コード: K7Q2XM")).toBeVisible();
    await expect(canvas.getByText("https://eshiritori.example/r/K7Q2XM")).toBeVisible();
    // UC-01 要件 1: 周回数とメンバーを表示する
    await expect(canvas.getByText("周回数: 1 周")).toBeVisible();
    await expect(memberNames(canvasElement, "メンバー（1/8）")).toEqual([
      "たろう（ホスト・あなた）",
    ]);
    // UC-03 要件 1: ホストの画面に「開始」の操作を表示する
    await expect(canvas.getByRole("button", { name: "開始" })).toBeEnabled();
    await expect(canvas.queryByText(/開始するのを待っています/)).toBeNull();
  },
};

export const HostWithMembers: Story = {
  name: "ホストが 3 人そろって待っている",
  args: { room: roomOf([taro, hanako, jiro]) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // UC-03 要件 1: ホストは「開始」を押せる
    await expect(memberNames(canvasElement, "メンバー（3/8）")).toEqual([
      "たろう（ホスト・あなた）",
      "はなこ",
      "じろう",
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "開始" }));
    await expect(args.onStart).toHaveBeenCalledTimes(1);
  },
};

export const MemberWaiting: Story = {
  name: "ホスト以外のメンバーが待っている",
  args: { room: roomOf([taro, hanako, jiro]), viewerPlayerId: jiro.playerId },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-03 要件 1: ホスト以外の画面には「開始」を出さず、ホストが開始するのを待っている旨を表示する
    await expect(canvas.queryByRole("button", { name: "開始" })).toBeNull();
    await expect(canvas.getByText("たろうさんが開始するのを待っています…")).toBeVisible();
    await expect(memberNames(canvasElement, "メンバー（3/8）")).toEqual([
      "たろう（ホスト）",
      "はなこ",
      "じろう（あなた）",
    ]);
    await expect(canvas.getByText("部屋コード: K7Q2XM")).toBeVisible();
    await expect(canvas.queryByText("https://eshiritori.example/r/K7Q2XM")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "招待 URL をコピー" })).toBeNull();
  },
};

export const CopyInviteUrl: Story = {
  name: "招待 URL をコピーする",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "招待 URL をコピー" }));
    await expect(args.onCopyInviteUrl).toHaveBeenCalledTimes(1);
    await expect(args.onCopyInviteUrl).toHaveBeenCalledWith("https://eshiritori.example/r/K7Q2XM");
  },
};

export const NotEnoughMembers: Story = {
  name: "1 人だけで開始しようとした",
  args: { startErrorCode: "room.not_enough_members" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-03 要件 4: 2 人未満では始められない誤りを出す
    await expect(canvas.getByRole("alert")).toHaveTextContent("2 人以上で始められます");
    await expect(canvas.getByRole("button", { name: "開始" })).toBeEnabled();
  },
};

export const UnexpectedStartError: Story = {
  name: "開始の想定外の誤り",
  args: { startErrorCode: "room.not_host" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "うまくいきませんでした。時間をおいてもう一度試してください",
    );
  },
};

export const Starting: Story = {
  name: "開始の要求中",
  args: { starting: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "開始" });
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onStart).not.toHaveBeenCalled();
  },
};
