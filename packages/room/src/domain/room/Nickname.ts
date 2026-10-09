import type { Result } from "@eshiritori/shared-kernel";
import { failure, success } from "@eshiritori/shared-kernel";

import { RoomError } from "../../errors/RoomError";

/** ニックネームの上限（見た目の文字数。UC-01 要件 4）。 */
const MAX_NICKNAME_LENGTH = 10;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** 見た目の文字数（絵文字 1 つを 1 文字）を数える。 */
function countGraphemes(value: string): number {
  return Array.from(graphemeSegmenter.segment(value)).length;
}

/** ニックネーム。部屋の中でプレイヤーが名乗る名前で、前後の空白を除いた 1〜10 文字。 */
export class Nickname {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /** 前後の空白を除いて検証し、ニックネームを作る。不正な入力は RoomError の Result で返す。 */
  static create(value: string): Result<Nickname, RoomError> {
    const trimmed = value.trim();
    if (trimmed === "") {
      return failure(new RoomError("nickname_empty", "Nickname must not be empty."));
    }
    if (countGraphemes(trimmed) > MAX_NICKNAME_LENGTH) {
      return failure(
        new RoomError(
          "nickname_too_long",
          `Nickname must be at most ${String(MAX_NICKNAME_LENGTH)} characters.`,
        ),
      );
    }
    return success(new Nickname(trimmed));
  }

  /** 前後の空白を除いたニックネームの文字列。 */
  get value(): string {
    return this.#value;
  }

  /** 値が完全一致するか。 */
  equals(other: Nickname): boolean {
    return this.#value === other.#value;
  }
}
