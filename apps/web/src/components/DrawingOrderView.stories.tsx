import type { components } from "@eshiritori/api-contract";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { DrawingOrderView } from "./DrawingOrderView";

type RoomSnapshot = components["schemas"]["RoomSnapshot"];

const taro = { playerId: "p-taro", nickname: "たろう" };
const hanako = { playerId: "p-hanako", nickname: "はなこ" };
const jiro = { playerId: "p-jiro", nickname: "じろう" };

// 描く順番は members の並び（サーバーが決めた順）
const startedRoom: RoomSnapshot = {
  code: "K7Q2XM",
  roundCount: 1,
  hostPlayerId: taro.playerId,
  status: "started",
  members: [jiro, taro, hanako],
};

const meta = {
  title: "描く順番",
  component: DrawingOrderView,
  args: { room: startedRoom, viewerPlayerId: taro.playerId },
} satisfies Meta<typeof DrawingOrderView>;

export default meta;
type Story = StoryObj<typeof meta>;

const orderOf = (canvasElement: HTMLElement): string[] =>
  within(within(canvasElement).getByRole("list", { name: "描く順番" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

export const SeenByHost: Story = {
  name: "ホストから見た描く順番",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-03 要件 3: 部屋のメンバーの並びのまま描く順番を表示する
    await expect(canvas.getByRole("heading", { name: "ゲームが始まりました" })).toBeVisible();
    await expect(canvas.getByText("周回数: 1 周")).toBeVisible();
    await expect(orderOf(canvasElement)).toEqual(["じろう", "たろう（あなた）", "はなこ"]);
  },
};

export const SeenByMember: Story = {
  name: "ホスト以外から見た描く順番",
  args: { viewerPlayerId: hanako.playerId },
  play: async ({ canvasElement }) => {
    // UC-03 要件 3: 全員で同じ並びが見える（印を除いた並びはホストの画面と同じ）
    await expect(orderOf(canvasElement)).toEqual(["じろう", "たろう", "はなこ（あなた）"]);
  },
};
