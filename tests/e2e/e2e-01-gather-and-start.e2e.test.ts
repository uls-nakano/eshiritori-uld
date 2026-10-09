// 前提: 外部システムのスタブは使わない。DynamoDB Local が起動して表がある。
//       部屋はテストの中で作るので、前の実行の部屋とは部屋コードで分かれる。
// 期待: たろう（ホスト）とはなこの 2 人の部屋になり、開始後は 2 人の画面に同じ並びの描く順番が出る。
//       並びはサーバーが決めるので、名前の並びそのものではなく「2 人の画面で同じ」ことを確かめる。
import { expect, test } from "@playwright/test";

test("E2E-01-01: 部屋を作り、招待 URL で誘った仲間が入り、ホストが始めると、全員の画面が同じ描く順番のゲーム画面になる", async ({
  page: taroPage,
  browser,
  baseURL,
}) => {
  // はなこの端末。localStorage を分けるため、別のブラウザコンテキストにする
  const hanakoContext = await browser.newContext();
  try {
    const hanakoPage = await hanakoContext.newPage();
    let inviteUrl = "";

    await test.step("たろうがトップ画面でニックネームを入れて部屋を作る", async () => {
      await taroPage.goto("/");
      const form = taroPage.locator("form", {
        has: taroPage.getByRole("heading", { name: "部屋を作る" }),
      });
      await form.getByLabel("ニックネーム").fill("たろう");
      await form.getByRole("button", { name: "部屋を作る" }).click();

      await expect(taroPage.getByRole("heading", { name: "待機室" })).toBeVisible();
      const members = taroPage.getByRole("list", { name: "メンバー（1/8）" });
      await expect(members.getByRole("listitem")).toHaveText(["たろう（ホスト・あなた）"]);
      await expect(taroPage.getByText(/^部屋コード: /)).toBeVisible();
    });

    await test.step("たろうが招待 URL をはなこに送る", async () => {
      const roomCodeText = await taroPage.getByText(/^部屋コード: /).innerText();
      const roomCode = roomCodeText.replace("部屋コード: ", "").trim();
      const shown = await taroPage.getByText(/\/r\//).innerText();
      inviteUrl = shown.trim();
      expect(inviteUrl).toBe(`${baseURL ?? ""}/r/${roomCode}`);
    });

    await test.step("はなこが招待 URL を開き、ニックネームを入れて部屋に入る", async () => {
      await hanakoPage.goto(inviteUrl);
      await expect(hanakoPage.getByText(/^部屋コード: /)).toBeVisible();
      await hanakoPage.getByLabel("ニックネーム").fill("はなこ");
      await hanakoPage.getByRole("button", { name: "入る" }).click();

      await expect(hanakoPage.getByRole("heading", { name: "待機室" })).toBeVisible();
      await expect(hanakoPage.getByText("たろうさんが開始するのを待っています…")).toBeVisible();
    });

    await test.step("たろうの待機室に、開き直すことなくはなこが加わる", async () => {
      const members = taroPage.getByRole("list", { name: "メンバー（2/8）" });
      await expect(members.getByRole("listitem")).toHaveText([
        "たろう（ホスト・あなた）",
        "はなこ",
      ]);
    });

    await test.step("たろうが開始を押すと、2 人の画面がゲーム画面に切り替わる", async () => {
      await taroPage.getByRole("button", { name: "開始" }).click();

      await expect(taroPage.getByRole("heading", { name: "ゲームが始まりました" })).toBeVisible();
      await expect(hanakoPage.getByRole("heading", { name: "ゲームが始まりました" })).toBeVisible();

      const taroOrder = await taroPage
        .getByRole("list", { name: "描く順番" })
        .getByRole("listitem")
        .allTextContents();
      const names = taroOrder.map((text) => text.replace("（あなた）", ""));
      expect([...names].sort()).toEqual(["たろう", "はなこ"]);

      // はなこの画面では、はなこの行にだけ「（あなた）」が付く
      const expectedOnHanako = names.map((name) => (name === "はなこ" ? "はなこ（あなた）" : name));
      await expect(
        hanakoPage.getByRole("list", { name: "描く順番" }).getByRole("listitem"),
      ).toHaveText(expectedOnHanako);
    });
  } finally {
    await hanakoContext.close();
  }
});
