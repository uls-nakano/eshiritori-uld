import type { components } from "@eshiritori/api-contract";
import { type ReactElement, type SubmitEvent, useId, useState } from "react";

import { describeFormError } from "./formErrorMessages";

type CreateRoomRequest = components["schemas"]["CreateRoomRequest"];

/** 周回数の選択肢（UC-01 要件 3 の表示の仕様。範囲外の判断はサーバーが持つ）。 */
const ROUND_COUNT_CHOICES = [1, 2, 3, 4, 5] as const;

/** CreateRoomForm に渡す値（送信の受け口と、直前の誤り・送信中の状態）。 */
export interface CreateRoomFormProps {
  /** 入力を送るとき。nickname は入力のまま（前後の空白を除かない）、roundCount は数値。 */
  onSubmit: (request: CreateRoomRequest) => void;
  /** 直前の送信が返した ErrorResponse の code。無ければ誤りを出さない。 */
  errorCode?: string | undefined;
  /** 送信中。ボタンを押せなくし、二重に部屋を作らないようにする。 */
  submitting?: boolean | undefined;
}

/** トップの「部屋を作る」欄。ニックネームと周回数の入力を表示し、送信と API の呼び出しは呼び出し側が持つ。 */
export function CreateRoomForm({
  onSubmit,
  errorCode,
  submitting = false,
}: CreateRoomFormProps): ReactElement {
  const id = useId();
  const [nickname, setNickname] = useState("");
  const [roundCount, setRoundCount] = useState(1);
  const error = errorCode === undefined ? undefined : describeFormError(errorCode);
  const nicknameError = error?.place === "nickname" ? error.message : undefined;
  const roundCountError = error?.place === "roundCount" ? error.message : undefined;
  const formError = error?.place === "form" ? error.message : undefined;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submitting) return;
    onSubmit({ nickname, roundCount });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>部屋を作る</h2>
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
      <div>
        <label htmlFor={`${id}-round-count`}>周回数</label>
        <select
          id={`${id}-round-count`}
          value={roundCount}
          onChange={(event) => {
            setRoundCount(Number(event.target.value));
          }}
          aria-invalid={roundCountError !== undefined}
          aria-describedby={roundCountError === undefined ? undefined : `${id}-round-count-error`}
        >
          {ROUND_COUNT_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice} 周
            </option>
          ))}
        </select>
        {roundCountError !== undefined && (
          <p id={`${id}-round-count-error`} style={{ color: "crimson" }}>
            {roundCountError}
          </p>
        )}
      </div>
      {formError !== undefined && (
        <p role="alert" style={{ color: "crimson" }}>
          {formError}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        部屋を作る
      </button>
    </form>
  );
}
