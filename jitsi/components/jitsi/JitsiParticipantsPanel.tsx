"use client";

import { Mic, MicOff, MonitorUp, Scan, Users, Video, VideoOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { JitsiParticipantView } from "@/hooks/useJitsiMeeting";
import { cn } from "@/lib/utils";

type JitsiParticipantsPanelProps = {
  open: boolean;
  participants: JitsiParticipantView[];
  onClose: () => void;
};

export function JitsiParticipantsPanel({
  open,
  participants,
  onClose,
}: JitsiParticipantsPanelProps) {
  const panelClasses =
    "flex h-full min-h-[24rem] flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card/85 shadow-xl shadow-black/10 backdrop-blur";

  return (
    <>
      <aside className={cn(panelClasses, open ? "hidden xl:flex" : "hidden")}>
        <ParticipantsPanelContent
          participants={participants}
          showCloseButton={false}
          onClose={onClose}
        />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/78 p-4 backdrop-blur-sm xl:hidden">
          <div className={cn(panelClasses, "mx-auto h-full max-w-md")}>
            <ParticipantsPanelContent
              participants={participants}
              showCloseButton
              onClose={onClose}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ParticipantsPanelContent({
  participants,
  showCloseButton,
  onClose,
}: {
  participants: JitsiParticipantView[];
  showCloseButton: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">Participants</p>
            <h2 className="text-base font-semibold tracking-tight">
              {participants.length} in room
            </h2>
          </div>
        </div>

        {showCloseButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label="Close participants"
          >
            <X className="size-5" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {participants.map((participant) => {
          const isMicOn = Boolean(participant.audioTrack && !participant.audioTrack.isMuted);
          const isCameraOn = Boolean(
            participant.videoTrack && !participant.videoTrack.isMuted,
          );
          const isSharing = Boolean(participant.screenTrack);

          return (
            <article
              key={participant.id}
              className="rounded-[1.4rem] border border-border/70 bg-background/72 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {participant.displayName}
                    {participant.isLocal ? " (you)" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {participant.isSpeaking ? "Speaking now" : "Connected"}
                  </p>
                </div>

                <div
                  className={cn(
                    "size-2.5 rounded-full",
                    participant.isSpeaking ? "bg-primary" : "bg-muted-foreground/35",
                  )}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <StatusChip active={isMicOn}>
                  {isMicOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
                  {isMicOn ? "Mic on" : "Muted"}
                </StatusChip>
                <StatusChip active={isCameraOn}>
                  {isCameraOn ? (
                    <Video className="size-3.5" />
                  ) : (
                    <VideoOff className="size-3.5" />
                  )}
                  {isCameraOn ? "Camera on" : "Camera off"}
                </StatusChip>
                {isSharing ? (
                  <StatusChip active>
                    {participant.screenTrack?.source === "partial-screen" ? (
                      <Scan className="size-3.5" />
                    ) : (
                      <MonitorUp className="size-3.5" />
                    )}
                    {participant.screenTrack?.source === "partial-screen"
                      ? "Partial share"
                      : "Sharing"}
                  </StatusChip>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function StatusChip({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        active
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-border/70 bg-muted/45 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
