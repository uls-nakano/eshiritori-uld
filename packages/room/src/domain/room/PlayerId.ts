import type { RandomSource } from "../random/RandomSource";

/** base64url の 64 文字。 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const ID_LENGTH = 12;

/** プレイヤー識別子。メンバーを指す、全員に公開してよい値。 */
export class PlayerId {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /** 乱数の源から新しいプレイヤー識別子を作る。 */
  static generate(random: RandomSource): PlayerId {
    let value = "";
    for (let i = 0; i < ID_LENGTH; i += 1) {
      value += ALPHABET.charAt(random.nextInt(ALPHABET.length));
    }
    return new PlayerId(value);
  }

  /** 保存された値から復元する。書式は検証しない。 */
  static create(value: string): PlayerId {
    return new PlayerId(value);
  }

  /** 識別子の文字列。 */
  get value(): string {
    return this.#value;
  }

  /** 値が完全一致するか。 */
  equals(other: PlayerId): boolean {
    return this.#value === other.#value;
  }
}
