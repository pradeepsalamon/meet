"use client";

import {
  LoaderCircle,
  Mic,
  MicOff,
  MessageSquareText,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MeetingControlsProps = {
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isBusy: boolean;
  isLeaving: boolean;
  onToggleMicrophone: () => Promise<void>;
  onToggleCamera: () => Promise<void>;
  onToggleScreenShare: () => Promise<void>;
  onToggleChat: () => void;
  onLeave: () => Promise<void>;
};

export function MeetingControls({
  isCameraEnabled,
  isMicrophoneEnabled,
  isScreenSharing,
  isChatOpen,
  isBusy,
  isLeaving,
  onToggleMicrophone,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}: MeetingControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-[1.75rem] border border-border/70 bg-card/85 p-3 shadow-xl shadow-black/10 backdrop-blur">
      <ControlButton
        active={isMicrophoneEnabled}
        label={isMicrophoneEnabled ? "Mute" : "Unmute"}
        onClick={onToggleMicrophone}
        disabled={isBusy || isLeaving}
      >
        {isBusy ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : isMicrophoneEnabled ? (
          <Mic className="size-5" />
        ) : (
          <MicOff className="size-5" />
        )}
      </ControlButton>

      <ControlButton
        active={isCameraEnabled}
        label={isCameraEnabled ? "Stop camera" : "Start camera"}
        onClick={onToggleCamera}
        disabled={isBusy || isLeaving}
      >
        {isCameraEnabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
      </ControlButton>

      <ControlButton
        active={isScreenSharing}
        label={isScreenSharing ? "Stop sharing" : "Share screen"}
        onClick={onToggleScreenShare}
        disabled={isBusy || isLeaving}
      >
        <MonitorUp className="size-5" />
      </ControlButton>

      <Button
        variant={isChatOpen ? "default" : "secondary"}
        className="rounded-2xl px-4"
        onClick={onToggleChat}
        disabled={isLeaving}
      >
        <MessageSquareText className="size-4" />
        {isChatOpen ? "Hide Chat" : "Open Chat"}
      </Button>

      <Button
        variant="destructive"
        size="icon"
        className={cn("size-12 rounded-2xl", isLeaving && "opacity-80")}
        onClick={onLeave}
        disabled={isLeaving}
        aria-label="Leave meeting"
      >
        {isLeaving ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : (
          <PhoneOff className="size-5" />
        )}
      </Button>
    </div>
  );
}

type ControlButtonProps = {
  active: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => Promise<void> | void;
  children: React.ReactNode;
};

function ControlButton({
  active,
  label,
  disabled,
  onClick,
  children,
}: ControlButtonProps) {
  return (
    <Button
      variant={active ? "default" : "secondary"}
      size="icon"
      className="size-12 rounded-2xl"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
