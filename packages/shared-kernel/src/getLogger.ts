import { ConsoleLogger } from "./ConsoleLogger";
import type { Logger } from "./Logger";

let current: Logger = new ConsoleLogger();

/** 共通の Logger を返す。処理側は getLogger().error(...) と書く。 */
export function getLogger(): Logger {
  return current;
}

/** 共通の Logger を差し替える。テストで MemoryLogger にするほか、composition root が出力先を変えるときに使う。 */
export function setLogger(logger: Logger): void {
  current = logger;
}
