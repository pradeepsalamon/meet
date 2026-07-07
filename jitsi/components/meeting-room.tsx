"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Video } from "lucide-react";

import { JitsiChatPanel } from "@/components/jitsi/JitsiChatPanel";
import { JitsiPartialScreenShareModal } from "@/components/jitsi/JitsiPartialScreenShareModal";
import { JitsiParticipantsPanel } from "@/components/jitsi/JitsiParticipantsPanel";
import { JitsiToolbar } from "@/components/jitsi/JitsiToolbar";
import { JitsiVideoGrid } from "@/components/jitsi/JitsiVideoGrid";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useJitsiMeeting, type JitsiConnectionStatus } from "@/hooks/useJitsiMeeting";

type MeetingRoomProps = {
  roomId: string;
  userName?: string;
};

type SidePanel = "chat" | "participants" | null;

function getConnectionStatusLabel(status: JitsiConnectionStatus) {
  switch (status) {
    case "loading":
      return "Loading Jitsi";
    case "permissions":
      return "Requesting media";
    case "connecting":
      return "Connecting";
    case "joining":
      return "Joining room";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Needs attention";
    default:
      return "Idle";
  }
}

function getLoadingMessage(status: JitsiConnectionStatus) {
  switch (status) {
    case "permissions":
      return "Requesting camera and microphone permissions...";
    case "connecting":
      return "Connecting to the Jitsi deployment...";
    case "joining":
      return "Joining the Jitsi room...";
    default:
      return "Preparing your Jitsi meeting...";
  }
}

export function MeetingRoom({ roomId, userName }: MeetingRoomProps) {
  const router = useRouter();
  const [isLeaving, startLeavingTransition] = useTransition();
  const hasUserName = Boolean(userName?.trim());
  const meeting = useJitsiMeeting({ roomId, userName });
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [isPartialShareModalOpen, setIsPartialShareModalOpen] = useState(false);
  const [readChatCount, setReadChatCount] = useState(0);
  const isChatOpen = sidePanel === "chat";
  const isParticipantListOpen = sidePanel === "participants";
  const unreadChatCount = useMemo(
    () =>
      isChatOpen
        ? 0
        : Math.max(0, meeting.chatMessages.length - readChatCount),
    [isChatOpen, meeting.chatMessages.length, readChatCount],
  );

  function closeSidePanel() {
    if (sidePanel === "chat") {
      setReadChatCount(meeting.chatMessages.length);
    }

    setSidePanel(null);
  }

  function toggleChatPanel() {
    if (sidePanel === "chat") {
      setReadChatCount(meeting.chatMessages.length);
      setSidePanel(null);
      return;
    }

    setSidePanel("chat");
  }

  function toggleParticipantsPanel() {
    if (sidePanel === "chat") {
      setReadChatCount(meeting.chatMessages.length);
    }

    setSidePanel((current) => (current === "participants" ? null : "participants"));
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

  if (meeting.status !== "connected" && meeting.error) {
    return (
      <MeetingState
        title="Could not join meeting"
        message={meeting.error}
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    );
  }

  if (meeting.status !== "connected" && !meeting.isJoined) {
    return <MeetingState message={getLoadingMessage(meeting.status)} />;
  }

  async function handleLeaveMeeting() {
    await meeting.leaveMeeting();
    startLeavingTransition(() => router.push("/"));
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-col gap-4 border-b border-border/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Video className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">BlueRoom Jitsi Session</p>
            <h1 className="text-xl font-semibold tracking-tight">{roomId}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill label={getConnectionStatusLabel(meeting.status)} />
          <StatusPill label={`Jitsi: ${meeting.jitsiRoomName}`} subtle />
          <StatusPill label={`You: ${meeting.displayName}`} subtle />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        {meeting.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {meeting.error}
          </div>
        ) : null}

        {!meeting.appId && meeting.domain === "meet.jit.si" ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
            Public meet.jit.si is useful for quick demos, but production rooms should use
            JaaS or a self-hosted Jitsi deployment.
          </div>
        ) : null}

        <div
          className={`grid flex-1 gap-6 ${
            sidePanel ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""
          }`}
        >
          <JitsiVideoGrid participants={meeting.participants} />

          {isChatOpen ? (
            <JitsiChatPanel
              currentUser={meeting.displayName}
              isLoading={meeting.isLoadingChat}
              messages={meeting.chatMessages}
              open={isChatOpen}
              roomId={roomId}
              onClose={closeSidePanel}
              onLoadMessages={meeting.loadChatMessages}
              onSendMessage={meeting.sendChatMessage}
            />
          ) : null}

          {isParticipantListOpen ? (
            <JitsiParticipantsPanel
              open={isParticipantListOpen}
              participants={meeting.participants}
              onClose={closeSidePanel}
            />
          ) : null}
        </div>

        <div className="pb-2">
          <JitsiToolbar
            isCameraEnabled={meeting.isCameraEnabled}
            isChatOpen={isChatOpen}
            isLeaving={isLeaving}
            isMicEnabled={meeting.isMicEnabled}
            isParticipantListOpen={isParticipantListOpen}
            isPartialScreenSharing={meeting.isPartialScreenSharing}
            isScreenSharing={meeting.isScreenSharing}
            unreadChatCount={unreadChatCount}
            onLeave={() => {
              void handleLeaveMeeting();
            }}
            onToggleCamera={meeting.toggleCamera}
            onToggleChat={toggleChatPanel}
            onToggleMicrophone={meeting.toggleMicrophone}
            onToggleParticipants={toggleParticipantsPanel}
            onTogglePartialShare={() => {
              if (meeting.isPartialScreenSharing) {
                void meeting.stopScreenShare();
                return;
              }

              setIsPartialShareModalOpen(true);
            }}
            onToggleScreenShare={meeting.toggleScreenShare}
          />
        </div>
      </main>

      {isPartialShareModalOpen ? (
        <JitsiPartialScreenShareModal
          open={isPartialShareModalOpen}
          onClose={() => setIsPartialShareModalOpen(false)}
          onCreatePreviewTrack={meeting.createPartialSharePreviewTrack}
          onStartPartialShare={meeting.startPartialScreenShare}
        />
      ) : null}
    </div>
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
