/** ドメイン上の失敗の基底。各 module は packageCode を固定した継承クラスを作る。 */
export abstract class DomainError<TErrorCode extends string = string> extends Error {
  /** 発生元の package を表す識別子（継承クラスが固定する）。 */
  readonly packageCode: string;
  /** package 内での失敗の種類（英語 snake_case）。 */
  readonly errorCode: TErrorCode;
  /** API と調査で使う、安定した英語の説明。 */
  readonly detail: string;
  /** `packageCode.errorCode` の形の、失敗を一意に示す識別子。 */
  readonly code: string;

  protected constructor(packageCode: string, errorCode: TErrorCode, detail: string) {
    const code = `${packageCode}.${errorCode}`;
    super(`${code}: ${detail}`);
    this.name = new.target.name;
    this.packageCode = packageCode;
    this.errorCode = errorCode;
    this.detail = detail;
    this.code = code;
  }
}
