import { readApiConfig } from "@eshiritori/api";

import { assertTablesReady } from "../support/assertTablesReady";

/** E2E の前に、DB の表が使えることを確かめる。DB が無いまま走ると原因が読めない時間切れになるため。 */
export default async function globalSetup(): Promise<void> {
  await assertTablesReady(readApiConfig(process.env));
}
