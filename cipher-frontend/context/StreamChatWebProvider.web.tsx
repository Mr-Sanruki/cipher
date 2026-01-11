import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useStreamChat } from "../hooks/useStreamChat";

export function StreamChatWebProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { client } = useStreamChat();
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    const id = "cipher-stream-chat-react-css";
    if (!isWeb) return;
    if (!client) return;
    if (typeof document === "undefined") return;
    if (document.getElementById(id)) return;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/stream-chat-react/dist/css/v2/index.css";
    document.head.appendChild(link);
  }, [isWeb, client]);

  useEffect(() => {
    const id = "cipher-stream-chat-theme";
    if (!isWeb) return;
    if (!client) return;
    if (typeof document === "undefined") return;
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
:root{
  --cipher-bg:#0b0f19;
  --cipher-surface:#0f172a;
  --cipher-surface2:#111c33;
  --cipher-border:rgba(255,255,255,.08);
  --cipher-text:#e5e7eb;
  --cipher-text2:rgba(229,231,235,.72);
  --cipher-accent:#5865f2;
  --cipher-accent2:#8b5cf6;
  --cipher-danger:#ef4444;
  --cipher-radius:14px;
}

html,body,#root{height:100%;}
body{background:var(--cipher-bg); color:var(--cipher-text); overflow:hidden;}

/* Stream base */
.str-chat{
  background:var(--cipher-bg);
  color:var(--cipher-text);
  height:100%;
}

.str-chat__container,
.str-chat__main-panel,
.str-chat__channel,
.str-chat__thread{
  background:var(--cipher-bg);
}

.str-chat__main-panel{
  height:100%;
}

.str-chat__channel{
  height:100%;
}

.str-chat__window{
  height:100%;
  display:flex;
  flex-direction:column;
  min-height:0;
}

/* Remove the default heavy frames */
.str-chat__channel-list,
.str-chat__channel-list-messenger{
  background:transparent;
}

/* Make message list scroll and keep input visible */
.str-chat__message-list{
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.str-chat__message-input{
  flex: 0 0 auto;
  position: sticky;
  bottom: 0;
  background: var(--cipher-bg);
  padding-bottom: 10px;
}

/* Message input + list polish */
.str-chat__message-input,
.str-chat__message-input-inner{
  background:rgba(255,255,255,.03);
  border:1px solid var(--cipher-border);
  border-radius:var(--cipher-radius);
}

.str-chat__message-input textarea{
  color:var(--cipher-text);
}

.str-chat__message-input textarea::placeholder{
  color:var(--cipher-text2);
}

.str-chat__message-list{
  background:transparent;
}

.str-chat__message-simple{
  padding:10px 12px;
  border-radius:12px;
}

.str-chat__message-simple:hover{
  background:rgba(255,255,255,.03);
}

/* Channel header */
.str-chat__channel-header{
  background:rgba(255,255,255,.02);
  border-bottom:1px solid var(--cipher-border);
}

.str-chat__channel-header-title,
.str-chat__channel-header-title span{
  color:var(--cipher-text);
}

/* Simple flat list rows (we render our own in Chat list) */
.cipher-channel-row:hover{
  background:rgba(255,255,255,.04) !important;
  border-color:rgba(255,255,255,.10) !important;
}

/* Buttons */
.str-chat button{
  border-radius:12px;
}

/* Scrollbars (Chromium) */
*::-webkit-scrollbar{height:10px;width:10px;}
*::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:999px;}
*::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.18);}
*::-webkit-scrollbar-track{background:transparent;}
`;

    document.head.appendChild(style);
  }, [isWeb, client]);

  if (!isWeb) {
    return <>{children}</>;
  }

  if (!client) {
    return <>{children}</>;
  }

  // Lazy-load web-only UI so native bundles don't try to parse it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Chat } = require("stream-chat-react") as any;

  return <Chat client={client as any}>{children}</Chat>;
}
