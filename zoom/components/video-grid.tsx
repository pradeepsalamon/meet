"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ZoomMediaStream, ZoomParticipant } from "@zoom/videosdk";
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActiveShare = {
  userId: number;
  label: string;
};

type VideoGridProps = {
  participants: ZoomParticipant[];
  currentUserId: number | null;
  mediaStream: ZoomMediaStream | null;
  activeShare: ActiveShare | null;
  isScreenSharing: boolean;
  shareCanvasRef: React.RefObject<HTMLCanvasElement | null>;
};

function participantName(participant: ZoomParticipant) {
  return participant.displayName || participant.userIdentity || `User ${participant.userId}`;
}

function hasVideo(participant: ZoomParticipant) {
  return Boolean(participant.bVideoOn);
}

function isMuted(participant: ZoomParticipant) {
  if (typeof participant.muted === "boolean") {
    return participant.muted;
  }

  if (!participant.audio) {
    return true;
  }

  return participant.audio.toLowerCase().includes("muted");
}

function participantInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const second = parts[1]?.[0] ?? "";

  return `${first}${second}`.toUpperCase();
}

export function VideoGrid({
  participants,
  currentUserId,
  mediaStream,
  activeShare,
  isScreenSharing,
  shareCanvasRef,
}: VideoGridProps) {
  const [fullscreenUserId, setFullscreenUserId] = useState<number | null>(null);
  const sortedParticipants = useMemo(
    () =>
      [...participants].sort((a, b) => {
        if (a.userId === currentUserId) {
          return -1;
        }
        if (b.userId === currentUserId) {
          return 1;
        }
        return participantName(a).localeCompare(participantName(b));
      }),
    [currentUserId, participants],
  );
  const fullscreenParticipant =
    sortedParticipants.find((participant) => participant.userId === fullscreenUserId) ?? null;

  return (
    <>
      <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-[2rem] border border-border/70 bg-card/60 p-3 shadow-inner shadow-neutral-950/5 backdrop-blur">
        <ShareStage
          activeShare={activeShare}
          isScreenSharing={isScreenSharing}
          shareCanvasRef={shareCanvasRef}
        />

        <div className="grid h-full min-h-[44vh] w-full grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {sortedParticipants.length ? (
            sortedParticipants.map((participant) => (
              <ZoomParticipantTile
                key={participant.userId}
                participant={participant}
                mediaStream={mediaStream}
                isLocal={participant.userId === currentUserId}
                onFullscreen={() => setFullscreenUserId(participant.userId)}
              />
            ))
          ) : (
            <div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-border/70 bg-background/45 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              Waiting for Zoom participants...
            </div>
          )}
        </div>
      </section>

      {fullscreenParticipant ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/92 p-4 backdrop-blur-md">
          <div className="relative flex h-full w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setFullscreenUserId(null)}
              >
                <Minimize2 className="size-4" />
                Exit full screen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => setFullscreenUserId(null)}
                aria-label="Close full screen view"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/40">
              <ZoomParticipantTile
                participant={fullscreenParticipant}
                mediaStream={mediaStream}
                isLocal={fullscreenParticipant.userId === currentUserId}
                isFullscreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ShareStage({
  activeShare,
  isScreenSharing,
  shareCanvasRef,
}: {
  activeShare: ActiveShare | null;
  isScreenSharing: boolean;
  shareCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const isActive = Boolean(activeShare || isScreenSharing);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.5rem] border bg-black transition",
        isActive
          ? "min-h-[18rem] border-border/70"
          : "pointer-events-none h-0 min-h-0 border-transparent",
      )}
      aria-hidden={!isActive}
    >
      <div className="relative aspect-video h-full w-full">
        <canvas
          ref={shareCanvasRef}
          className="h-full w-full bg-black object-contain"
          width={1280}
          height={720}
        />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
          <MonitorUp className="size-4" />
          {activeShare?.label ?? "Your screen"}
        </div>
      </div>
    </div>
  );
}

function ZoomParticipantTile({
  participant,
  mediaStream,
  isLocal,
  isFullscreen = false,
  onFullscreen,
}: {
  participant: ZoomParticipant;
  mediaStream: ZoomMediaStream | null;
  isLocal: boolean;
  isFullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const name = participantName(participant);
  const videoOn = hasVideo(participant);
  const muted = isMuted(participant);

  useEffect(() => {
    const container = videoContainerRef.current;
    const stream = mediaStream;

    if (!container || !stream || !videoOn) {
      container?.replaceChildren();
      return;
    }

    const targetContainer = container;
    const activeStream = stream;
    let cancelled = false;

    async function attachVideo() {
      try {
        const attachedVideo = await activeStream.attachVideo(participant.userId, 2);

        if (cancelled) {
          await activeStream.detachVideo(participant.userId).catch(() => undefined);
          return;
        }

        const videoElements = Array.isArray(attachedVideo)
          ? attachedVideo
          : [attachedVideo];

        targetContainer.replaceChildren(...videoElements);
      } catch {
        targetContainer.replaceChildren();
      }
    }

    void attachVideo();

    return () => {
      cancelled = true;
      targetContainer.replaceChildren();
      void activeStream.detachVideo(participant.userId).catch(() => undefined);
    };
  }, [mediaStream, participant.userId, videoOn]);

  return (
    <article
      className={cn(
        "group relative aspect-video min-h-[15rem] overflow-hidden rounded-[1.5rem] border border-border/60 bg-neutral-950 shadow-lg shadow-neutral-950/15",
        isFullscreen && "h-full min-h-0 rounded-[2rem] border-white/10",
      )}
    >
      <div ref={videoContainerRef} className="absolute inset-0" />

      {!videoOn ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.28),transparent_34%),linear-gradient(145deg,#111827,#020617)] text-white">
          <div className="flex size-20 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl font-semibold shadow-2xl shadow-black/30">
            {participantInitials(name)}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-white/72">
            <UserRound className="size-4" />
            Camera off
          </div>
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/78 to-transparent p-4 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {name}
            {isLocal ? " (You)" : ""}
          </p>
          <p className="text-xs text-white/65">{participant.isHost ? "Host" : "Participant"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/45">
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </span>
          {onFullscreen ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 rounded-full border-white/25 bg-black/45 text-white opacity-100 backdrop-blur hover:bg-black/55 hover:text-white sm:opacity-0 sm:transition sm:group-hover:opacity-100"
              onClick={onFullscreen}
              aria-label={`View ${name} full screen`}
            >
              <Maximize2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
