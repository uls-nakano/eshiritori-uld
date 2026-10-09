import type { RandomSource } from "../random/RandomSource";

/** base64url の 64 文字。 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const TOKEN_LENGTH = 32;

/** 時間差で中身を推測されないよう、一致する長さなら最後まで比べる。長さの違いだけは即座に返す。 */
function equalsInConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** プレイヤートークン。メンバー本人だけが持つ秘密の値。ログや詳細に値を出さない。 */
export class PlayerToken {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /** 乱数の源から新しいプレイヤートークンを作る。 */
  static generate(random: RandomSource): PlayerToken {
    let value = "";
    for (let i = 0; i < TOKEN_LENGTH; i += 1) {
      value += ALPHABET.charAt(random.nextInt(ALPHABET.length));
    }
    return new PlayerToken(value);
  }

  /** 要求や保存から受け取った値で復元する。書式は検証しない。 */
  static create(value: string): PlayerToken {
    return new PlayerToken(value);
  }

  /** トークンの文字列。 */
  get value(): string {
    return this.#value;
  }

  /** 値が一致するか。定数時間で比べる。 */
  equals(other: PlayerToken): boolean {
    return equalsInConstantTime(this.#value, other.#value);
  }
}
