/**
 * 乱数の源。部屋コード・プレイヤー識別子・プレイヤートークン・描く順番の並べ替えが使う。
 *
 * 契約: `bound` は 1 以上の整数で、戻り値は 0 以上 `bound` 未満の整数。
 * 契約を守る責務は実装側にあり、ドメインは戻り値を検査しない。
 */
export interface RandomSource {
  /** 0 以上 `bound` 未満の整数を返す。 */
  nextInt(bound: number): number;
}
