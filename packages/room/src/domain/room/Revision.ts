import { getLogger } from "@eshiritori/shared-kernel";

/** 改訂番号。部屋が保存された回数で、保存の条件に使う。 */
export class Revision {
  readonly #value: number;

  private constructor(value: number) {
    this.#value = value;
  }

  /** まだ一度も保存されていない値（0）。 */
  static initial(): Revision {
    return new Revision(0);
  }

  /** 保存先から読んだ値で復元する。1 以上の整数でなければ RangeError を投げる。 */
  static restore(value: number): Revision {
    if (!Number.isInteger(value) || value < 1) {
      getLogger().error("復元する改訂番号が 1 以上の整数ではありません", { value });
      throw new RangeError("Revision must be a positive integer.");
    }
    return new Revision(value);
  }

  /** 1 つ進めた新しい改訂番号。 */
  next(): Revision {
    return new Revision(this.#value + 1);
  }

  /** まだ一度も保存されていないか。 */
  isInitial(): boolean {
    return this.#value === 0;
  }

  /** 保存された回数。 */
  get value(): number {
    return this.#value;
  }

  /** 値が一致するか。 */
  equals(other: Revision): boolean {
    return this.#value === other.#value;
  }
}
