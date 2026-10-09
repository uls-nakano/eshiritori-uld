import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { CreateRoomForm } from "./CreateRoomForm";

const meta = {
  title: "部屋を作るフォーム",
  component: CreateRoomForm,
  args: { onSubmit: fn() },
} satisfies Meta<typeof CreateRoomForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InitialDisplay: Story = {
  name: "最初の表示",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-01 要件 3: 周回数は 1〜5 から選べ、最初は 1
    const select = canvas.getByLabelText<HTMLSelectElement>("周回数");
    await expect(
      within(select)
        .getAllByRole<HTMLOptionElement>("option")
        .map((option) => option.value),
    ).toEqual(["1", "2", "3", "4", "5"]);
    await expect(select).toHaveValue("1");
    await expect(canvas.getByLabelText("ニックネーム")).toHaveValue("");
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(canvas.queryByText("ニックネームを入れてください")).toBeNull();
  },
};

export const SubmitWithDefaultRoundCount: Story = {
  name: "周回数を変えずに部屋を作る",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // UC-01 要件 3: 周回数を変えなければ、最初の 1 で送られる
    await userEvent.type(canvas.getByLabelText("ニックネーム"), "たろう");
    await userEvent.click(canvas.getByRole("button", { name: "部屋を作る" }));
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith({
      nickname: "たろう",
      roundCount: 1,
    });
  },
};

export const SubmitWithChosenRoundCount: Story = {
  name: "周回数を指定して部屋を作る",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("ニックネーム"), "たろう");
    await userEvent.selectOptions(canvas.getByLabelText("周回数"), "3");
    await userEvent.click(canvas.getByRole("button", { name: "部屋を作る" }));
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith({
      nickname: "たろう",
      roundCount: 3,
    });
  },
};

export const NicknameEmpty: Story = {
  name: "ニックネームが空",
  args: { errorCode: "room.nickname_empty" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-01 要件 4: 空のニックネームは入力欄に結んだ誤りを出す
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
    // UC-01 要件 4: 長すぎるニックネームの誤りを出し、入力は消さない
    const input = canvas.getByLabelText("ニックネーム");
    await userEvent.type(input, "あいうえおかきくけこさ");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(/ニックネームは 10 文字までです/);
    await expect(input).toHaveValue("あいうえおかきくけこさ");
  },
};

export const RoundCountOutOfRange: Story = {
  name: "周回数が範囲外",
  args: { errorCode: "room.round_count_out_of_range" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // UC-01 要件 5: 範囲外の周回数の誤りを周回数の欄に結んで出す
    const select = canvas.getByLabelText("周回数");
    await expect(select).toHaveAttribute("aria-invalid", "true");
    await expect(select).toHaveAccessibleDescription(/周回数は 1〜5 の間で指定してください/);
  },
};

export const UnexpectedError: Story = {
  name: "想定外の誤り",
  args: { errorCode: "server.internal_error" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "うまくいきませんでした。時間をおいてもう一度試してください",
    );
  },
};

export const Submitting: Story = {
  name: "送信中",
  args: { submitting: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "部屋を作る" });
    await expect(button).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("ニックネーム"), "たろう{Enter}");
    await userEvent.click(button);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
