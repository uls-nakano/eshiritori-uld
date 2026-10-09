import type { RandomSource } from "../random/RandomSource";
import { Nickname } from "./Nickname";
import { PlayerId } from "./PlayerId";
import { PlayerToken } from "./PlayerToken";

/** メンバー。部屋に入ったプレイヤー 1 人で、部屋の中だけで同一性を持つ。 */
export class Member {
  readonly #playerId: PlayerId;
  readonly #token: PlayerToken;
  readonly #nickname: Nickname;

  private constructor(playerId: PlayerId, token: PlayerToken, nickname: Nickname) {
    this.#playerId = playerId;
    this.#token = token;
    this.#nickname = nickname;
  }

  /** 検証済みのニックネームで、新しい識別子とトークンを発行したメンバーを作る。 */
  static create(nickname: Nickname, random: RandomSource): Member {
    const playerId = PlayerId.generate(random);
    const token = PlayerToken.generate(random);
    return new Member(playerId, token, nickname);
  }

  /** 保存された値から復元する。 */
  static restore(playerId: PlayerId, token: PlayerToken, nickname: Nickname): Member {
    return new Member(playerId, token, nickname);
  }

  /** このトークンの持ち主か。 */
  isHeldBy(token: PlayerToken): boolean {
    return this.#token.equals(token);
  }

  /** 同じニックネームか。 */
  isNamed(nickname: Nickname): boolean {
    return this.#nickname.equals(nickname);
  }

  /** プレイヤー識別子。 */
  get playerId(): PlayerId {
    return this.#playerId;
  }

  /** プレイヤートークン。本人以外に返さない。 */
  get token(): PlayerToken {
    return this.#token;
  }

  /** ニックネーム。 */
  get nickname(): Nickname {
    return this.#nickname;
  }
}
