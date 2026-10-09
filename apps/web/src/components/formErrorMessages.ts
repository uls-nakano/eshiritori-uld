import type { components } from "@eshiritori/api-contract";

type ErrorResponse = components["schemas"]["ErrorResponse"];

/** 誤りを表示する場所。nickname・roundCount・roomCode は入力欄の下、form はボタンの上。 */
export type FormErrorPlace = "nickname" | "roundCount" | "roomCode" | "form";

/** API の ErrorResponse.code を、表示する文言と場所に対応させる。未知の code は想定外の文言に寄せる。 */
export function describeFormError(code: ErrorResponse["code"]): {
  place: FormErrorPlace;
  message: string;
} {
  switch (code) {
    case "room.nickname_empty":
      return { place: "nickname", message: "ニックネームを入れてください" };
    case "room.nickname_too_long":
      return { place: "nickname", message: "ニックネームは 10 文字までです" };
    case "room.round_count_out_of_range":
      return { place: "roundCount", message: "周回数は 1〜5 の間で指定してください" };
    case "room.room_not_found":
      return { place: "roomCode", message: "部屋が見つかりません" };
    case "room.room_full":
      return { place: "form", message: "満員のため入れません" };
    case "room.game_already_started":
      return { place: "form", message: "ゲーム中のため入れません" };
    case "room.nickname_taken":
      return {
        place: "nickname",
        message: "同じニックネームの人がいます。別のニックネームにしてください",
      };
    case "room.not_enough_members":
      return { place: "form", message: "2 人以上で始められます" };
    default:
      return {
        place: "form",
        message: "うまくいきませんでした。時間をおいてもう一度試してください",
      };
  }
}
