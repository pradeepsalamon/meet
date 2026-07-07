"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageSquareText, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { JitsiChatMessage } from "@/hooks/useJitsiMeeting";
import { cn } from "@/lib/utils";

type JitsiChatPanelProps = {
  currentUser: string;
  isLoading: boolean;
  messages: JitsiChatMessage[];
  open: boolean;
  roomId: string;
  onClose: () => void;
  onLoadMessages: () => Promise<void>;
  onSendMessage: (message: string) => Promise<void>;
};

const CHAT_POLL_INTERVAL_MS = 5000;

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function JitsiChatPanel({
  currentUser,
  isLoading,
  messages,
  open,
  roomId,
  onClose,
  onLoadMessages,
  onSendMessage,
}: JitsiChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    void onLoadMessages();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void onLoadMessages();
      }
    }, CHAT_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void onLoadMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onLoadMessages, open]);

  useEffect(() => {
    const container = messagesRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextMessage = draft.trim();

    if (!nextMessage || isSending) {
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      await onSendMessage(nextMessage);
      setDraft("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  }

  const panelClasses =
    "flex h-full min-h-[24rem] flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card/85 shadow-xl shadow-black/10 backdrop-blur";

  return (
    <>
      <aside className={cn(panelClasses, open ? "hidden xl:flex" : "hidden")}>
        <ChatPanelContent
          currentUser={currentUser}
          draft={draft}
          isLoading={isLoading}
          isSending={isSending}
          messages={messages}
          messagesRef={messagesRef}
          roomId={roomId}
          sendError={sendError}
          showCloseButton={false}
          onClose={onClose}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
        />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/78 p-4 backdrop-blur-sm xl:hidden">
          <div className={cn(panelClasses, "mx-auto h-full max-w-md")}>
            <ChatPanelContent
              currentUser={currentUser}
              draft={draft}
              isLoading={isLoading}
              isSending={isSending}
              messages={messages}
              messagesRef={messagesRef}
              roomId={roomId}
              sendError={sendError}
              showCloseButton
              onClose={onClose}
              onDraftChange={setDraft}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChatPanelContent({
  currentUser,
  draft,
  isLoading,
  isSending,
  messages,
  messagesRef,
  roomId,
  sendError,
  showCloseButton,
  onClose,
  onDraftChange,
  onSubmit,
}: {
  currentUser: string;
  draft: string;
  isLoading: boolean;
  isSending: boolean;
  messages: JitsiChatMessage[];
  messagesRef: React.RefObject<HTMLDivElement | null>;
  roomId: string;
  sendError: string | null;
  showCloseButton: boolean;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const hasMessages = messages.length > 0;

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <MessageSquareText className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">Room chat</p>
            <h2 className="text-base font-semibold tracking-tight">{roomId}</h2>
          </div>
        </div>

        {showCloseButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label="Close chat"
          >
            <X className="size-5" />
          </Button>
        ) : null}
      </div>

      <div ref={messagesRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isLoading && !hasMessages ? (
          <div className="flex h-full min-h-[16rem] items-center justify-center">
            <LoaderCircle className="size-8 animate-spin text-primary" />
          </div>
        ) : hasMessages ? (
          messages.map((message) => {
            const isOwnMessage =
              message.sender.trim().toLowerCase() ===
              currentUser.trim().toLowerCase();

            return (
              <article
                key={message.id}
                className={cn(
                  "max-w-[88%] rounded-[1.4rem] border px-4 py-3 shadow-sm",
                  isOwnMessage
                    ? "ml-auto border-primary/20 bg-primary/10 text-foreground"
                    : "border-border/70 bg-background/80 text-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{message.sender}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {message.body}
                </p>
              </article>
            );
          })
        ) : (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border/70 bg-background/45 px-6 text-center">
            <MessageSquareText className="size-8 text-primary" />
            <p className="mt-4 text-base font-semibold">Start the conversation</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Messages use Jitsi endpoint messages, with an app fallback while the server is running.
            </p>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-border/70 p-4">
        <label htmlFor="jitsi-chat-input" className="sr-only">
          Type a chat message
        </label>
        <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-3 shadow-inner shadow-slate-950/5">
          <textarea
            id="jitsi-chat-input"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Type a message and press send..."
            rows={3}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-h-5 text-xs text-muted-foreground">
              {sendError ?? "Enter to send, Shift + Enter for a new line."}
            </div>
            <Button
              type="submit"
              className="rounded-xl px-4"
              disabled={!draft.trim() || isSending}
            >
              {isSending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
