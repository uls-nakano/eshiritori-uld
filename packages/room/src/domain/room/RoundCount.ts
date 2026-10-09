import type { Result } from "@eshiritori/shared-kernel";
import { failure, success } from "@eshiritori/shared-kernel";

import { RoomError } from "../../errors/RoomError";

/** 周回数の下限（UC-01 要件 5）。 */
const MIN_ROUND_COUNT = 1;
/** 周回数の上限（UC-01 要件 5）。 */
const MAX_ROUND_COUNT = 5;

/** 周回数。全員が描き手を務める回数で、1〜5 の整数。既定値を持たない。 */
export class RoundCount {
  readonly #value: number;

  private constructor(value: number) {
    this.#value = value;
  }

  /** 検証して周回数を作る。不正な入力は RoomError の Result で返す。 */
  static create(value: number): Result<RoundCount, RoomError> {
    if (!Number.isInteger(value) || value < MIN_ROUND_COUNT || value > MAX_ROUND_COUNT) {
      return failure(
        new RoomError(
          "round_count_out_of_range",
          `Round count must be an integer from ${String(MIN_ROUND_COUNT)} to ${String(MAX_ROUND_COUNT)}.`,
        ),
      );
    }
    return success(new RoundCount(value));
  }

  /** 周回数。 */
  get value(): number {
    return this.#value;
  }

  /** 周回数が等しいか。 */
  equals(other: RoundCount): boolean {
    return this.#value === other.#value;
  }
}
