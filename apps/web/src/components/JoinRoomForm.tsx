import type { components } from "@eshiritori/api-contract";
import { type ReactElement, type SubmitEvent, useId, useState } from "react";

import { describeFormError } from "./formErrorMessages";

type JoinRoomRequest = components["schemas"]["JoinRoomRequest"];

/** 送る値。roomCode は path に、残りは JoinRoomRequest の本文になる。 */
interface JoinRoomInput extends JoinRoomRequest {
  roomCode: string;
}

/** トップの「部屋に入る」欄と、招待 URL から開いた参加画面の入力部分。 */
export interface JoinRoomFormProps {
  /** 招待 URL の部屋コード。あれば部屋コードを入力欄でなく固定の表示にする。 */
  invitedRoomCode?: string | undefined;
  onSubmit: (input: JoinRoomInput) => void;
  /** 直前の送信が返した ErrorResponse の code。無ければ誤りを出さない。 */
  errorCode?: string | undefined;
  /** 送信中。ボタンを押せなくする。 */
  submitting?: boolean | undefined;
}

/** 部屋に入る入力部分。部屋コード（招待 URL なら固定表示）とニックネームを表示し、送信と API の呼び出しは呼び出し側が持つ。 */
export function JoinRoomForm({
  invitedRoomCode,
  onSubmit,
  errorCode,
  submitting = false,
}: JoinRoomFormProps): ReactElement {
  const id = useId();
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const error = errorCode === undefined ? undefined : describeFormError(errorCode);
  // 部屋コードを入力欄で持たない（招待 URL）ときは、部屋コードの誤りをボタンの上に出す
  const roomCodeInField = invitedRoomCode === undefined;
  const roomCodeError = error?.place === "roomCode" && roomCodeInField ? error.message : undefined;
  const nicknameError = error?.place === "nickname" ? error.message : undefined;
  const formError =
    error?.place === "form" || (error?.place === "roomCode" && !roomCodeInField)
      ? error.message
      : undefined;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submitting) return;
    onSubmit({ roomCode: invitedRoomCode ?? roomCode, nickname });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>部屋に入る</h2>
      {invitedRoomCode === undefined ? (
        <div>
          <label htmlFor={`${id}-room-code`}>部屋コード</label>
          <input
            id={`${id}-room-code`}
            type="text"
            value={roomCode}
            onChange={(event) => {
              setRoomCode(event.target.value);
            }}
            aria-invalid={roomCodeError !== undefined}
            aria-describedby={`${id}-room-code-hint${roomCodeError === undefined ? "" : ` ${id}-room-code-error`}`}
          />
          <small id={`${id}-room-code-hint`}>6 文字</small>
          {roomCodeError !== undefined && (
            <p id={`${id}-room-code-error`} style={{ color: "crimson" }}>
              {roomCodeError}
            </p>
          )}
        </div>
      ) : (
        <p>部屋コード: {invitedRoomCode}</p>
      )}
      <div>
        <label htmlFor={`${id}-nickname`}>ニックネーム</label>
        <input
          id={`${id}-nickname`}
          type="text"
          value={nickname}
          onChange={(event) => {
            setNickname(event.target.value);
          }}
          aria-invalid={nicknameError !== undefined}
          aria-describedby={`${id}-nickname-hint${nicknameError === undefined ? "" : ` ${id}-nickname-error`}`}
        />
        <small id={`${id}-nickname-hint`}>10 文字まで</small>
        {nicknameError !== undefined && (
          <p id={`${id}-nickname-error`} style={{ color: "crimson" }}>
            {nicknameError}
          </p>
        )}
      </div>
      {formError !== undefined && (
        <p role="alert" style={{ color: "crimson" }}>
          {formError}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        入る
      </button>
    </form>
  );
}
