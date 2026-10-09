/** 調査のための変数値。原因の変数値だけを入れる（規約は呼び出し側で守る）。 */
export type LogContext = Readonly<Record<string, unknown>>;

/** ログの重大さ。`error` は throw 直前の原因の記録、`warn` は失敗ではないが調べたい記録、`info` は起動などの経過の記録。 */
export type LogLevel = "info" | "warn" | "error";

/** プロジェクト共通のログ出力の契約。処理側は getLogger() から取得して呼ぶ。出力に失敗しても throw しない。 */
export interface Logger {
  /** 起動など、経過を残したいときに使う。 */
  info(message: string, context?: LogContext): void;
  /** 失敗ではないが、後で調べたい事象を残すときに使う。 */
  warn(message: string, context?: LogContext): void;
  /** throw 直前に、原因を残すときに使う。 */
  error(message: string, context?: LogContext): void;
}
