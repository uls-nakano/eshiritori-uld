import type { LogContext, Logger } from "./Logger";

/** console のうち ConsoleLogger が使う出力先の形。テストで差し替えるために受け取る。 */
interface ConsoleOutput {
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
}

// Node と browser のどちらにも実行時の console はある。型環境（lib: ES2022）に宣言が無いため型だけ与える。
declare const console: ConsoleOutput;

/** console へ出力する Logger。整形は console に任せる。 */
export class ConsoleLogger implements Logger {
  constructor(private readonly output: ConsoleOutput = console) {}

  info(message: string, context?: LogContext): void {
    if (context === undefined) {
      this.output.info(message);
      return;
    }
    this.output.info(message, context);
  }

  warn(message: string, context?: LogContext): void {
    if (context === undefined) {
      this.output.warn(message);
      return;
    }
    this.output.warn(message, context);
  }

  error(message: string, context?: LogContext): void {
    // stack を取る処理は private メソッドに切り出さない。切り出すと落とす frame の数が変わるため、この本体に置く。
    // 先頭 2 行（見出しの "Error" とこのメソッド自身の frame）を落とし、呼び出し元から始める。
    /* v8 ignore next -- defensive: V8 以外では stack が undefined になりうるがテストから到達できない */
    const stack = (new Error().stack ?? "").split("\n").slice(2).join("\n");
    this.output.error(message, {
      ...context,
      stack: context?.stack !== undefined ? context.stack : stack,
    });
  }
}
