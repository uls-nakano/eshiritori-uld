import type { Result } from "@eshiritori/shared-kernel";
import { failure, success } from "@eshiritori/shared-kernel";

import { RoomError } from "../../errors/RoomError";
import type { RandomSource } from "../random/RandomSource";

/** 部屋コードに使う文字（36 文字）。 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** 部屋コードの文字数（UC-01 要件 2）。 */
const CODE_LENGTH = 6;

/** 部屋コードの書式。文字数は CODE_LENGTH と合わせる。 */
const CODE_FORMAT = new RegExp(`^[0-9A-Za-z]{${String(CODE_LENGTH)}}$`);

/** 部屋コード。部屋を指す英数字 6 文字の値で、大文字にそろえて持つ。 */
export class RoomCode {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /** 乱数の源から新しい部屋コードを作る。 */
  static generate(random: RandomSource): RoomCode {
    let value = "";
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      value += ALPHABET.charAt(random.nextInt(ALPHABET.length));
    }
    return new RoomCode(value);
  }

  /**
   * 入力された文字列から部屋コードを作る。全角半角・前後の空白・大文字小文字の違いはそろえる。
   * 書式の誤りは room_not_found の RoomError で返す。
   */
  static create(value: string): Result<RoomCode, RoomError> {
    const trimmed = value.normalize("NFKC").trim();
    if (!CODE_FORMAT.test(trimmed)) {
      return failure(
        new RoomError("room_not_found", "Room code must be 6 alphanumeric characters."),
      );
    }
    // 大文字化は検証の後に行う（ß が SS になるなど、英字でない文字が化けて通るのを防ぐ）
    return success(new RoomCode(trimmed.toUpperCase()));
  }

  /** 大文字にそろえた部屋コードの文字列。 */
  get value(): string {
    return this.#value;
  }

  /** 値が完全一致するか。 */
  equals(other: RoomCode): boolean {
    return this.#value === other.#value;
  }
}
