import type { LogContext, Logger, LogLevel } from "./Logger";

/** MemoryLogger が記録する 1 件。 */
export interface LogEntry {
  /** 呼ばれたメソッドに対応するレベル。 */
  readonly level: LogLevel;
  /** 渡された message。 */
  readonly message: string;
  /** 渡された context。省いたときは undefined。 */
  readonly context: LogContext | undefined;
}

/** テスト用に、呼ばれた順で記録をためる Logger。stack は補わない。 */
export class MemoryLogger implements Logger {
  private readonly records: LogEntry[] = [];

  /** 呼ばれた順の全件のコピーを返す。 */
  get entries(): readonly LogEntry[] {
    return [...this.records];
  }

  info(message: string, context?: LogContext): void {
    this.records.push({ level: "info", message, context });
  }

  warn(message: string, context?: LogContext): void {
    this.records.push({ level: "warn", message, context });
  }

  error(message: string, context?: LogContext): void {
    this.records.push({ level: "error", message, context });
  }
}
