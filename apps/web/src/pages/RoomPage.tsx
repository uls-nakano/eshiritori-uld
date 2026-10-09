import type { components } from "@eshiritori/api-contract";
import { type ReactElement, useEffect, useRef, useState } from "react";

import { type ApiClient, isApiFailure, isApiSuccess } from "../api/apiClient";
import type { ConnectRoomSocket } from "../api/roomSocket";
import { DrawingOrderView } from "../components/DrawingOrderView";
import { describeFormError } from "../components/formErrorMessages";
import { JoinRoomForm } from "../components/JoinRoomForm";
import { WaitingRoom } from "../components/WaitingRoom";
import type { PlayerTokenStore } from "../storage/playerTokenStore";

type RoomSnapshot = components["schemas"]["RoomSnapshot"];

/** /r/{部屋コード} の画面。招待 URL を開いた人の参加と、メンバーの待機室・描く順番を出す。 */
export interface RoomPageProps {
  /** URL の /r/{部屋コード} の部屋コード（入力のまま）。 */
  roomCode: string;
  api: ApiClient;
  tokenStore: PlayerTokenStore;
  connectSocket: ConnectRoomSocket;
  /** 招待 URL を組み立てるオリジン（WaitingRoom に渡す）。 */
  appOrigin: string;
  /** 招待 URL をコピーする。失敗は reject で返し、ページが無視する。 */
  copyText: (text: string) => Promise<void>;
}

type State =
  | { kind: "loading"; playerToken: string }
  | { kind: "join"; errorCode?: string; submitting: boolean }
  | { kind: "member"; room: RoomSnapshot; viewerPlayerId: string; playerToken: string }
  | { kind: "unavailable"; errorCode: string };

/** 部屋のページ。保存済みのトークンがあれば参加画面を出さずに待機室を出す。 */
export function RoomPage({
  roomCode,
  api,
  tokenStore,
  connectSocket,
  appOrigin,
  copyText,
}: RoomPageProps): ReactElement {
  const [state, setState] = useState<State>(() => {
    const playerToken = tokenStore.load(roomCode);
    return playerToken === undefined
      ? { kind: "join", submitting: false }
      : { kind: "loading", playerToken };
  });
  const [startErrorCode, setStartErrorCode] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  // 通知の接続と読み込みの効果は、最初の 1 回の判断（トークンの有無）に従う
  const initial = useRef(state);

  useEffect(() => {
    const first = initial.current;
    if (first.kind !== "loading") return;
    let cancelled = false;
    void api.getRoom(roomCode, first.playerToken).then((result) => {
      if (cancelled) return;
      if (isApiSuccess(result)) {
        setState({
          kind: "member",
          room: result.value.room,
          viewerPlayerId: result.value.playerId,
          playerToken: first.playerToken,
        });
      } else if (result.code === "room.room_not_found") {
        tokenStore.remove(roomCode);
        setState({ kind: "join", errorCode: result.code, submitting: false });
      } else if (result.code === "room.not_member") {
        tokenStore.remove(roomCode);
        setState({ kind: "join", submitting: false });
      } else {
        setState({ kind: "unavailable", errorCode: result.code });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, roomCode, tokenStore]);

  const memberToken = state.kind === "member" ? state.playerToken : undefined;
  useEffect(() => {
    if (memberToken === undefined) return;
    const socket = connectSocket({
      roomCode,
      playerToken: memberToken,
      onNotification: (notification) => {
        setState((current) =>
          current.kind === "member" ? { ...current, room: notification.room } : current,
        );
        if (notification.type === "member_joined") setStartErrorCode(undefined);
      },
    });
    return () => {
      socket.close();
    };
  }, [connectSocket, roomCode, memberToken]);

  if (state.kind === "loading") return <p>読み込み中…</p>;

  if (state.kind === "unavailable") {
    return <p role="alert">{describeFormError(state.errorCode).message}</p>;
  }

  if (state.kind === "join") {
    return (
      <JoinRoomForm
        invitedRoomCode={roomCode}
        errorCode={state.errorCode}
        submitting={state.submitting}
        onSubmit={({ roomCode: code, nickname }) => {
          setState({ kind: "join", submitting: true });
          void api.joinRoom(code, { nickname }).then((result) => {
            if (isApiFailure(result)) {
              setState({ kind: "join", errorCode: result.code, submitting: false });
              return;
            }
            tokenStore.save(result.value.room.code, result.value.player.playerToken);
            setState({
              kind: "member",
              room: result.value.room,
              viewerPlayerId: result.value.player.playerId,
              playerToken: result.value.player.playerToken,
            });
          });
        }}
      />
    );
  }

  const { room, viewerPlayerId, playerToken } = state;
  if (room.status !== "waiting") {
    return <DrawingOrderView room={room} viewerPlayerId={viewerPlayerId} />;
  }
  return (
    <WaitingRoom
      room={room}
      viewerPlayerId={viewerPlayerId}
      appOrigin={appOrigin}
      startErrorCode={startErrorCode}
      starting={starting}
      onStart={() => {
        setStartErrorCode(undefined);
        setStarting(true);
        void api.startGame(roomCode, playerToken).then((result) => {
          setStarting(false);
          if (isApiSuccess(result)) {
            setState((current) =>
              current.kind === "member" ? { ...current, room: result.value.room } : current,
            );
          } else {
            setStartErrorCode(result.code);
          }
        });
      }}
      onCopyInviteUrl={(inviteUrl) => {
        copyText(inviteUrl).catch(() => {
          // 招待 URL は画面に文字で出ているので、手で写せる
        });
      }}
    />
  );
}
