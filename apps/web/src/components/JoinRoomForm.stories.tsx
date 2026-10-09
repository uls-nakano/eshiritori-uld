import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { JoinRoomForm } from "./JoinRoomForm";

const meta = {
  title: "部屋に入るフォーム",
  component: JoinRoomForm,
  args: { onSubmit: fn() },
} satisfies Meta<typeof JoinRoomForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SubmitWithTypedRoomCode: Story = {
  name: "部屋コードを入れて入る",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("ニックネーム")).toHaveAccessibleDescription("10 文字まで");
    await userEvent.type(canvas.getByLabelText("部屋コード"), "k7q2xm");
    await userEvent.type(canvas.getByLabelText("ニックネーム"), "じろう");
    await userEvent.click(canvas.getByRole("button", { name: "入る" }));
    // 部屋コードは入力のまま送る（正規化はサーバーが持つ）
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith({
      roomCode: "k7q2xm",
      nickname: "じろう",
    });
  },
};

export const SubmitWithInvitedRoomCode: Story = {
  name: "招待 URL の部屋コードで入る",
  args: { invitedRoomCode: "K7Q2XM" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByLabelText("部屋コード")).toBeNull();
    await expect(canvas.getByText("部屋コード: K7Q2XM")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("ニックネーム"), "じろう");
    await userEvent.click(canvas.getByRole("button", { name: "入る" }));
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith({
      roomCode: "K7Q2XM",
      nickname: "じろう",
    });
  },
};

export const RoomNotFound: Story = {
  name: "部屋が見つからない",
  args: { errorCode: "room.room_not_found" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 4: 部屋が見つからない誤りを部屋コードの欄に結んで出す
    const input = canvas.getByLabelText("部屋コード");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(/部屋が見つかりません/);
  },
};

export const InvitedRoomNotFound: Story = {
  name: "招待 URL の部屋が見つからない",
  args: { invitedRoomCode: "K7Q2XM", errorCode: "room.room_not_found" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 4: 招待 URL の部屋が見つからない誤りをボタンの上に出す
    await expect(canvas.getByRole("alert")).toHaveTextContent("部屋が見つかりません");
    await expect(canvas.queryByLabelText("部屋コード")).toBeNull();
  },
};

export const RoomFull: Story = {
  name: "満員",
  args: { errorCode: "room.room_full" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 6: 満員の誤りを出す
    await expect(canvas.getByRole("alert")).toHaveTextContent("満員のため入れません");
  },
};

export const GameAlreadyStarted: Story = {
  name: "ゲーム中",
  args: { errorCode: "room.game_already_started" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 7: ゲーム中の誤りを出す
    await expect(canvas.getByRole("alert")).toHaveTextContent("ゲーム中のため入れません");
  },
};

export const NicknameTaken: Story = {
  name: "ニックネームが重複",
  args: { errorCode: "room.nickname_taken" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 8: 重複の誤りをニックネームの欄に結んで出す
    const input = canvas.getByLabelText("ニックネーム");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(
      /同じニックネームの人がいます。別のニックネームにしてください/,
    );
  },
};

export const NicknameEmpty: Story = {
  name: "ニックネームが空",
  args: { errorCode: "room.nickname_empty" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 9: 空のニックネームの誤りを出す
    const input = canvas.getByLabelText("ニックネーム");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(/ニックネームを入れてください/);
  },
};

export const NicknameTooLong: Story = {
  name: "ニックネームが長すぎる",
  args: { errorCode: "room.nickname_too_long" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-02 要件 9: 長すぎるニックネームの誤りを出す
    await expect(canvas.getByLabelText("ニックネーム")).toHaveAccessibleDescription(
      /ニックネームは 10 文字までです/,
    );
  },
};

export const Submitting: Story = {
  name: "送信中",
  args: { submitting: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "入る" });
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
