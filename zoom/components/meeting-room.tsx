"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ZoomChatClient,
  ZoomChatMessagePayload,
  ZoomClient,
  ZoomMediaStream,
  ZoomParticipant,
} from "@zoom/videosdk";
import { LoaderCircle, Video } from "lucide-react";

import { MeetingChat, type MeetingChatMessage } from "@/components/meeting-chat";
import { MeetingControls } from "@/components/meeting-controls";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { type ActiveShare, VideoGrid } from "@/components/video-grid";
import { getConnectionStatusLabel } from "@/lib/meeting";
import { loadZoomVideoSdk } from "@/lib/zoom-sdk";

type MeetingRoomProps = {
  roomId: string;
  userName?: string;
};

type TokenResponse = {
  token: string;
  sessionName: string;
  userName: string;
  passcode?: string;
  error?: string;
};

function normalizeConnectionState(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object" && "state" in payload) {
    return String((payload as { state?: unknown }).state ?? "idle");
  }

  return "idle";
}

function zoomEventObject(payload: unknown) {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

function participantName(participant: ZoomParticipant | undefined) {
  if (!participant) {
    return "Participant";
  }

  return participant.displayName || participant.userIdentity || `User ${participant.userId}`;
}

function parseChatMessage(
  payload: ZoomChatMessagePayload,
  participants: ZoomParticipant[],
) {
  const body = String(payload.message ?? payload.text ?? "").trim();

  if (!body) {
    return null;
  }

  const senderId = payload.sender?.userId ?? payload.senderId;
  const senderFromParticipants = participants.find(
    (participant) => participant.userId === senderId,
  );
  const sender =
    payload.sender?.name ??
    payload.sender?.displayName ??
    payload.senderName ??
    participantName(senderFromParticipants);
  const timestamp = payload.timestamp ?? Date.now();

  return {
    id: payload.id ?? `${senderId ?? sender}-${timestamp}-${body}`,
    sender,
    body,
    timestamp,
  };
}

function sortParticipants(
  participants: ZoomParticipant[],
  currentUserId: number | null,
) {
  return [...participants].sort((a, b) => {
    if (a.userId === currentUserId) {
      return -1;
    }
    if (b.userId === currentUserId) {
      return 1;
    }
    if (a.isHost && !b.isHost) {
      return -1;
    }
    if (b.isHost && !a.isHost) {
      return 1;
    }

    return participantName(a).localeCompare(participantName(b));
  });
}

export function MeetingRoom({ roomId, userName }: MeetingRoomProps) {
  const router = useRouter();
  const hasUserName = Boolean(userName?.trim());
  const displayName = userName?.trim().replace(/\s+/g, " ") ?? "Guest";
  const clientRef = useRef<ZoomClient | null>(null);
  const mediaStreamRef = useRef<ZoomMediaStream | null>(null);
  const chatClientRef = useRef<ZoomChatClient | null>(null);
  const participantsRef = useRef<ZoomParticipant[]>([]);
  const currentUserIdRef = useRef<number | null>(null);
  const hasStartedAudioRef = useRef(false);
  const joinedRef = useRef(false);
  const shareCanvasRef = useRef<HTMLCanvasElement>(null);

  const [participants, setParticipants] = useState<ZoomParticipant[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [mediaStream, setMediaStream] = useState<ZoomMediaStream | null>(null);
  const [connectionState, setConnectionState] = useState("idle");
  const [activeShare, setActiveShare] = useState<ActiveShare | null>(null);
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isLoading, setIsLoading] = useState(hasUserName);
  const [isBusy, setIsBusy] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startRouteTransition] = useTransition();

  const refreshParticipants = useCallback((nextClient = clientRef.current) => {
    if (!nextClient) {
      return;
    }

    const allUsers = nextClient.getAllUser() ?? [];
    const currentUser = nextClient.getCurrentUserInfo?.();
    const nextUsers =
      currentUser && !allUsers.some((user) => user.userId === currentUser.userId)
        ? [currentUser, ...allUsers]
        : allUsers;
    const sortedUsers = sortParticipants(nextUsers, currentUser?.userId ?? null);

    participantsRef.current = sortedUsers;
    currentUserIdRef.current = currentUser?.userId ?? null;
    setParticipants(sortedUsers);
    setCurrentUserId(currentUser?.userId ?? null);
  }, []);

  const appendChatMessage = useCallback((message: MeetingChatMessage) => {
    setChatMessages((current) => {
      const duplicate = current.some((item) => {
        if (item.id === message.id) {
          return true;
        }

        return (
          item.isLocalEcho &&
          item.sender === message.sender &&
          item.body === message.body &&
          Math.abs(item.timestamp - message.timestamp) < 5000
        );
      });

      if (duplicate) {
        return current;
      }

      return [...current, message];
    });
  }, []);

  useEffect(() => {
    if (!hasUserName) {
      return;
    }

    let isMounted = true;
    const cleanupHandlers: Array<() => void> = [];

    function setSafeError(nextError: string) {
      if (isMounted) {
        setError(nextError);
      }
    }

    async function joinSession() {
      setIsLoading(true);
      setError(null);
      setConnectionState("connecting");

      try {
        const tokenResponse = await fetch("/api/zoom/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionName: roomId,
            userName: displayName,
            role: 1,
          }),
        });
        const tokenData = (await tokenResponse.json()) as TokenResponse;

        if (!tokenResponse.ok || !tokenData.token) {
          throw new Error(tokenData.error ?? "Unable to create Zoom session token.");
        }

        const zoomVideo = await loadZoomVideoSdk();
        const client = zoomVideo.createClient();
        clientRef.current = client;

        const addHandler = (event: string, handler: (payload: unknown) => void) => {
          client.on(event, handler);
          cleanupHandlers.push(() => client.off(event, handler));
        };

        addHandler("connection-change", (payload) => {
          if (!isMounted) {
            return;
          }

          setConnectionState(normalizeConnectionState(payload));
        });
        addHandler("user-added", () => refreshParticipants(client));
        addHandler("user-removed", () => refreshParticipants(client));
        addHandler("user-updated", () => refreshParticipants(client));
        addHandler("peer-video-state-change", () => refreshParticipants(client));
        addHandler("peer-audio-state-change", () => refreshParticipants(client));
        addHandler("chat-on-message", (payload) => {
          const message = parseChatMessage(
            payload as ZoomChatMessagePayload,
            participantsRef.current,
          );

          if (message) {
            appendChatMessage(message);
          }
        });
        addHandler("active-share-change", async (payload) => {
          const eventPayload = zoomEventObject(payload);
          const rawState = String(
            eventPayload.state ?? eventPayload.action ?? "",
          ).toLowerCase();
          const shareUserId = Number(
            eventPayload.userId ??
              eventPayload.activeUserId ??
              eventPayload.sharerId,
          );
          const stream = mediaStreamRef.current;
          const canvas = shareCanvasRef.current;
          const isActive =
            rawState.includes("active") ||
            rawState.includes("start") ||
            eventPayload.active === true;

          if (!stream || !canvas || !Number.isFinite(shareUserId)) {
            return;
          }

          if (isActive) {
            const sharingUser = participantsRef.current.find(
              (participant) => participant.userId === shareUserId,
            );

            if (shareUserId !== currentUserIdRef.current) {
              await stream.stopShareView().catch(() => undefined);
              await stream.startShareView(canvas, shareUserId).catch(() => undefined);
            }

            setActiveShare({
              userId: shareUserId,
              label: `${participantName(sharingUser)}'s screen`,
            });
            return;
          }

          await stream.stopShareView().catch(() => undefined);
          setActiveShare(null);

          if (shareUserId === currentUserIdRef.current) {
            setIsScreenSharing(false);
          }
        });

        await client.init("en-US", "Global", {
          leaveOnPageUnload: true,
          patchJsMedia: true,
        });
        await client.join(
          tokenData.sessionName,
          tokenData.token,
          tokenData.userName,
          tokenData.passcode || undefined,
        );

        const nextMediaStream = client.getMediaStream();
        const nextChatClient = client.getChatClient();
        mediaStreamRef.current = nextMediaStream;
        chatClientRef.current = nextChatClient;
        joinedRef.current = true;

        if (isMounted) {
          setMediaStream(nextMediaStream);
          setConnectionState("connected");
          refreshParticipants(client);
        }
      } catch (joinError) {
        setSafeError(
          joinError instanceof Error
            ? joinError.message
            : "Unable to join the Zoom session.",
        );
        setConnectionState("failed");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void joinSession();

    return () => {
      isMounted = false;
      cleanupHandlers.forEach((cleanup) => cleanup());

      if (joinedRef.current) {
        joinedRef.current = false;
        void mediaStreamRef.current?.stopShareView().catch(() => undefined);
        void mediaStreamRef.current?.stopShareScreen().catch(() => undefined);
        void clientRef.current?.leave(false).catch(() => undefined);
      }
    };
  }, [appendChatMessage, displayName, hasUserName, refreshParticipants, roomId]);

  async function withBusy(action: () => Promise<void>) {
    if (isBusy || isLeaving) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The meeting action could not be completed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleMicrophone() {
    await withBusy(async () => {
      const stream = mediaStreamRef.current;

      if (!stream) {
        throw new Error("Zoom media stream is not ready.");
      }

      if (!hasStartedAudioRef.current) {
        await stream.startAudio();
        hasStartedAudioRef.current = true;
      }

      if (isMicrophoneEnabled) {
        await stream.muteAudio();
        setIsMicrophoneEnabled(false);
        return;
      }

      await stream.unmuteAudio();
      setIsMicrophoneEnabled(true);
      refreshParticipants();
    });
  }

  async function toggleCamera() {
    await withBusy(async () => {
      const stream = mediaStreamRef.current;

      if (!stream) {
        throw new Error("Zoom media stream is not ready.");
      }

      if (isCameraEnabled) {
        await stream.stopVideo();
        setIsCameraEnabled(false);
        refreshParticipants();
        return;
      }

      await stream.startVideo({ hd: true });
      setIsCameraEnabled(true);
      refreshParticipants();
    });
  }

  async function toggleScreenShare() {
    await withBusy(async () => {
      const stream = mediaStreamRef.current;
      const canvas = shareCanvasRef.current;

      if (!stream || !canvas) {
        throw new Error("Zoom screen share surface is not ready.");
      }

      if (isScreenSharing) {
        await stream.stopShareScreen();
        setIsScreenSharing(false);
        setActiveShare(null);
        return;
      }

      await stream.startShareScreen(canvas);
      setIsScreenSharing(true);
      setActiveShare({
        userId: currentUserIdRef.current ?? 0,
        label: "Your screen",
      });
    });
  }

  async function leaveMeeting() {
    if (isLeaving) {
      return;
    }

    setIsLeaving(true);

    try {
      joinedRef.current = false;
      await mediaStreamRef.current?.stopShareView().catch(() => undefined);
      await mediaStreamRef.current?.stopShareScreen().catch(() => undefined);
      await clientRef.current?.leave(false).catch(() => undefined);
    } finally {
      startRouteTransition(() => router.push("/"));
    }
  }

  async function sendChatMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const messageBody = chatDraft.trim();

    if (!messageBody || isSendingChat) {
      return;
    }

    const chatClient = chatClientRef.current;

    if (!chatClient) {
      setChatError("Zoom chat is not ready yet.");
      return;
    }

    setIsSendingChat(true);
    setChatError(null);

    try {
      await chatClient.sendToAll(messageBody);
      appendChatMessage({
        id: crypto.randomUUID(),
        sender: displayName,
        body: messageBody,
        timestamp: Date.now(),
        isLocalEcho: true,
      });
      setChatDraft("");
    } catch (sendError) {
      setChatError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send Zoom chat message.",
      );
    } finally {
      setIsSendingChat(false);
    }
  }

  if (!hasUserName) {
    return (
      <MeetingState
        title="Missing display name"
        message="Please return home, enter your display name, and join again."
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return <MeetingState message="Joining the Zoom Video SDK session..." />;
  }

  if (error && !mediaStream) {
    return (
      <MeetingState
        title="Could not join meeting"
        message={error}
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <header className="flex flex-col gap-4 border-b border-border/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Video className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">BlueRoom Zoom Session</p>
            <h1 className="text-xl font-semibold tracking-tight">{roomId}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill label={getConnectionStatusLabel(connectionState)} />
          <StatusPill label={`You: ${displayName}`} subtle />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <VideoGrid
            participants={participants}
            currentUserId={currentUserId}
            mediaStream={mediaStream}
            activeShare={activeShare}
            isScreenSharing={isScreenSharing}
            shareCanvasRef={shareCanvasRef}
          />
          <MeetingChat
            open={isChatOpen}
            roomId={roomId}
            currentUser={displayName}
            draft={chatDraft}
            messages={chatMessages}
            isSending={isSendingChat}
            error={chatError}
            onDraftChange={setChatDraft}
            onSubmit={sendChatMessage}
            onClose={() => setIsChatOpen(false)}
          />
        </div>

        <div className="pb-2">
          <MeetingControls
            isCameraEnabled={isCameraEnabled}
            isMicrophoneEnabled={isMicrophoneEnabled}
            isScreenSharing={isScreenSharing}
            isChatOpen={isChatOpen}
            isBusy={isBusy}
            isLeaving={isLeaving}
            onToggleMicrophone={toggleMicrophone}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={toggleScreenShare}
            onToggleChat={() => setIsChatOpen((current) => !current)}
            onLeave={leaveMeeting}
          />
        </div>
      </main>
    </>
  );
}

function MeetingState({
  title = "Joining room",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-card/85 p-8 text-center shadow-2xl shadow-neutral-950/10 backdrop-blur">
        <LoaderCircle className="mx-auto size-10 animate-spin text-primary" />
        <h2 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  subtle = false,
}: {
  label: string;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-full border px-3 py-1.5 text-sm ${
        subtle
          ? "border-border/70 bg-card/80 text-muted-foreground"
          : "border-primary/20 bg-primary/10 text-primary"
      }`}
    >
      {label}
    </div>
  );
}
