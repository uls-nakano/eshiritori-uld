import type { components } from "@eshiritori/api-contract";
import type { ReactElement } from "react";
import { useId } from "react";

import { describeFormError } from "./formErrorMessages";

type RoomSnapshot = components["schemas"]["RoomSnapshot"];

/** 部屋の人数の上限。表示の定数で、満員の判断はサーバーが持つ。 */
const ROOM_CAPACITY = 8;

/** 待機室の表示。開始の API 呼び出し・招待 URL のコピーは呼び出し側が持つ。 */
export interface WaitingRoomProps {
  /** 最後に届いた部屋の写し（応答または通知）。 */
  room: RoomSnapshot;
  /** この画面を見ている本人のプレイヤー識別子。メンバー一覧の「あなた」と、ホストかどうかを決める。 */
  viewerPlayerId: string;
  /** 配信元のオリジン（例: https://eshiritori.example）。招待 URL を組み立てる。 */
  appOrigin: string;
  /** ホストが「開始」を押したとき。 */
  onStart: () => void;
  /** 「招待 URL をコピー」を押したとき。組み立てた招待 URL を渡す。 */
  onCopyInviteUrl: (inviteUrl: string) => void;
  /** 直前の開始の要求が返した ErrorResponse の code。無ければ誤りを出さない。 */
  startErrorCode?: string | undefined;
  /** 開始の要求中。ボタンを押せなくする。 */
  starting?: boolean | undefined;
}

/** 待機室。部屋コード・（ホストだけ）招待 URL・メンバー一覧と、ホストの開始／ホスト以外の待ち表示を出す。 */
export function WaitingRoom({
  room,
  viewerPlayerId,
  appOrigin,
  onStart,
  onCopyInviteUrl,
  startErrorCode,
  starting = false,
}: WaitingRoomProps): ReactElement {
  const headingId = useId();
  const isHost = room.hostPlayerId === viewerPlayerId;
  const inviteUrl = new URL(`/r/${room.code}`, appOrigin).href;
  const host = room.members.find((member) => member.playerId === room.hostPlayerId);
  const startError = startErrorCode === undefined ? undefined : describeFormError(startErrorCode);

  const marksOf = (playerId: string): string => {
    const marks = [
      ...(playerId === room.hostPlayerId ? ["ホスト"] : []),
      ...(playerId === viewerPlayerId ? ["あなた"] : []),
    ];
    return marks.length === 0 ? "" : `（${marks.join("・")}）`;
  };

  return (
    <section>
      <h2>待機室</h2>
      <p>部屋コード: {room.code}</p>
      {isHost && (
        <div>
          <p>{inviteUrl}</p>
          <button
            type="button"
            onClick={() => {
              onCopyInviteUrl(inviteUrl);
            }}
          >
            招待 URL をコピー
          </button>
        </div>
      )}
      <p>周回数: {room.roundCount} 周</p>
      <h3 id={headingId}>
        メンバー（{room.members.length}/{ROOM_CAPACITY}）
      </h3>
      <ul aria-labelledby={headingId}>
        {room.members.map((member) => (
          <li key={member.playerId}>
            {member.nickname}
            {marksOf(member.playerId)}
          </li>
        ))}
      </ul>
      {isHost ? (
        <div>
          {startError !== undefined && (
            <p role="alert" style={{ color: "crimson" }}>
              {startError.message}
            </p>
          )}
          <button
            type="button"
            disabled={starting}
            onClick={() => {
              onStart();
            }}
          >
            開始
          </button>
        </div>
      ) : (
        <p>{host === undefined ? "ホスト" : `${host.nickname}さん`}が開始するのを待っています…</p>
      )}
    </section>
  );
}
