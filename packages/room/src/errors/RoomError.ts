import { DomainError } from "@eshiritori/shared-kernel";

import type { RoomErrorCode } from "./RoomErrorCode";

/** room module の業務上の失敗。`code` は `room.<errorCode>` の形になる。 */
export class RoomError extends DomainError<RoomErrorCode> {
  constructor(errorCode: RoomErrorCode, detail: string) {
    super("room", errorCode, detail);
  }
}
