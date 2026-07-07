"use client";

import {
  Mic,
  MicOff,
  MessageSquareText,
  MonitorUp,
  PhoneOff,
  Scan,
  Users,
  Video,
  VideoOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type JitsiToolbarProps = {
  isCameraEnabled: boolean;
  isChatOpen: boolean;
  isLeaving: boolean;
  isMicEnabled: boolean;
  isParticipantListOpen: boolean;
  isPartialScreenSharing: boolean;
  isScreenSharing: boolean;
  unreadChatCount: number;
  onLeave: () => void;
  onToggleCamera: () => void | Promise<void>;
  onToggleChat: () => void;
  onToggleMicrophone: () => void | Promise<void>;
  onToggleParticipants: () => void;
  onTogglePartialShare: () => void | Promise<void>;
  onToggleScreenShare: () => void | Promise<void>;
};

export function JitsiToolbar({
  isCameraEnabled,
  isChatOpen,
  isLeaving,
  isMicEnabled,
  isParticipantListOpen,
  isPartialScreenSharing,
  isScreenSharing,
  unreadChatCount,
  onLeave,
  onToggleCamera,
  onToggleChat,
  onToggleMicrophone,
  onToggleParticipants,
  onTogglePartialShare,
  onToggleScreenShare,
}: JitsiToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-[1.75rem] border border-border/70 bg-card/85 p-3 shadow-xl shadow-black/10 backdrop-blur">
      <ControlButton
        active={isMicEnabled}
        label={isMicEnabled ? "Mute" : "Unmute"}
        onClick={onToggleMicrophone}
      >
        {isMicEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </ControlButton>

      <ControlButton
        active={isCameraEnabled}
        label={isCameraEnabled ? "Stop camera" : "Start camera"}
        onClick={onToggleCamera}
      >
        {isCameraEnabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
      </ControlButton>

      <ControlButton
        active={isScreenSharing && !isPartialScreenSharing}
        label={isScreenSharing ? "Stop sharing" : "Share screen"}
        onClick={onToggleScreenShare}
      >
        <MonitorUp className="size-5" />
      </ControlButton>

      <Button
        variant={isPartialScreenSharing ? "default" : "secondary"}
        className="rounded-2xl px-4"
        onClick={onTogglePartialShare}
      >
        <Scan className="size-4" />
        {isPartialScreenSharing ? "Stop Partial Share" : "Partial Share"}
      </Button>

      <PanelButton
        active={isChatOpen}
        label={isChatOpen ? "Hide Chat" : "Open Chat"}
        unreadCount={unreadChatCount}
        onClick={onToggleChat}
      >
        <MessageSquareText className="size-4" />
        {isChatOpen ? "Hide Chat" : "Open Chat"}
      </PanelButton>

      <PanelButton
        active={isParticipantListOpen}
        label={isParticipantListOpen ? "Hide Participants" : "Participants"}
        onClick={onToggleParticipants}
      >
        <Users className="size-4" />
        Participants
      </PanelButton>

      <Button
        variant="destructive"
        size="icon"
        className={cn("size-12 rounded-2xl", isLeaving && "opacity-80")}
        onClick={onLeave}
        disabled={isLeaving}
        aria-label="Leave meeting"
      >
        <PhoneOff className="size-5" />
      </Button>
    </div>
  );
}

function ControlButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <Button
      variant={active ? "default" : "secondary"}
      size="icon"
      className="size-12 rounded-2xl"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

function PanelButton({
  active,
  children,
  label,
  unreadCount = 0,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  unreadCount?: number;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "secondary"}
      className="relative rounded-2xl px-4"
      onClick={onClick}
      aria-label={label}
    >
      {children}
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[0.68rem] font-semibold text-destructive-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </Button>
  );
}
