import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createApiClient } from "./api/apiClient";
import { createRoomSocketConnector } from "./api/roomSocket";
import { App } from "./App";
import { createPlayerTokenStore } from "./storage/playerTokenStore";

const appOrigin = window.location.origin;
const socketUrl = new URL("/ws", appOrigin);
socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

// localStorage の参照そのものが例外になる環境では、何も覚えない記憶域に寄せる
const storage = ((): Pick<Storage, "getItem" | "setItem" | "removeItem"> => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
})();

const root = document.getElementById("root");
if (root === null) throw new Error("#root がありません");

createRoot(root).render(
  <StrictMode>
    <App
      api={createApiClient(appOrigin, fetch.bind(globalThis))}
      tokenStore={createPlayerTokenStore(storage)}
      connectSocket={createRoomSocketConnector(socketUrl.href)}
      copyText={async (text) => {
        await navigator.clipboard.writeText(text);
      }}
      appOrigin={appOrigin}
    />
  </StrictMode>,
);
