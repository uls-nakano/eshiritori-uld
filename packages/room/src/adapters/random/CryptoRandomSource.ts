import { randomInt } from "node:crypto";

import type { RandomSource } from "../../domain/random/RandomSource";

/** 暗号論的に安全な乱数の源。`node:crypto` の `randomInt` は棄却法で、剰余の偏りが無い。 */
export class CryptoRandomSource implements RandomSource {
  /** 0 以上 `bound` 未満の整数を返す。 */
  nextInt(bound: number): number {
    return randomInt(bound);
  }
}
