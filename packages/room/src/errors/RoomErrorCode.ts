/** room module の失敗の種類（英語 snake_case）。`RoomError.code` は `room.<この値>` になる。 */
export type RoomErrorCode =
  /** ニックネームが空（空白だけを含む）。 */
  | "nickname_empty"
  /** ニックネームが前後の空白を除いて 10 文字を超える。 */
  | "nickname_too_long"
  /** 周回数が 1〜5 の整数でない。 */
  | "round_count_out_of_range"
  /** 部屋が無い・期限切れ・部屋コードの書式誤り。 */
  | "room_not_found"
  /** メンバーが既に 8 人いる。 */
  | "room_full"
  /** 一度でもゲームが始まった部屋に入ろうとした。 */
  | "game_already_started"
  /** 同じ部屋に同じニックネームのメンバーがいる。 */
  | "nickname_taken"
  /** 部屋のメンバーでない（トークンが部屋のどのメンバーのものでもない、またはトークンが無い）。 */
  | "not_member"
  /** ホスト以外（メンバーでない人を含む）からの開始の要求。 */
  | "not_host"
  /** メンバーがホスト 1 人だけで開始しようとした。 */
  | "not_enough_members";
