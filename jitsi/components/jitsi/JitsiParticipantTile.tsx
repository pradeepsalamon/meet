"use client";

import { useEffect, useMemo, useRef } from "react";
import { Maximize2, Mic, MicOff, MonitorUp, Scan, VideoOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { JitsiParticipantView, JitsiTrackView } from "@/hooks/useJitsiMeeting";
import { cn } from "@/lib/utils";

type JitsiParticipantTileProps = {
  participant: JitsiParticipantView;
  trackView: JitsiTrackView | null;
  onOpenFullscreen?: () => void;
};

export function JitsiParticipantTile({
  participant,
  trackView,
  onOpenFullscreen,
}: JitsiParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isScreenShare =
    trackView?.source === "screen" || trackView?.source === "partial-screen";
  const showVideo = Boolean(trackView && trackView.type === "video" && !trackView.isMuted);
  const initials = useMemo(
    () =>
      participant.displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "G",
    [participant.displayName],
  );

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !trackView || trackView.type !== "video" || trackView.isMuted) {
      return;
    }

    trackView.track.attach(video);

    return () => {
      trackView.track.detach(video);
    };
  }, [trackView]);

  useEffect(() => {
    const audio = audioRef.current;
    const audioTrack = participant.audioTrack;

    if (!audio || !audioTrack || audioTrack.isLocal || audioTrack.isMuted) {
      return;
    }

    audioTrack.track.attach(audio);

    return () => {
      audioTrack.track.detach(audio);
    };
  }, [participant.audioTrack]);

  return (
    <article className="group relative aspect-video min-h-[15rem] overflow-hidden rounded-[1.5rem] border border-border/60 bg-slate-950/90 shadow-lg shadow-slate-950/20">
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted={trackView?.isLocal}
          playsInline
          className={cn(
            "h-full w-full bg-black",
            isScreenShare ? "object-contain" : "object-cover",
            trackView?.isLocal && !isScreenShare && "-scale-x-100",
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.24),transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] text-white">
          <div className="flex size-20 items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/10 text-2xl font-semibold shadow-xl shadow-black/20">
            {isScreenShare ? <MonitorUp className="size-9" /> : initials}
          </div>
          <p className="mt-4 text-sm text-white/72">
            {isScreenShare ? "Screen share paused" : "Camera is off"}
          </p>
        </div>
      )}

      {participant.audioTrack && !participant.audioTrack.isLocal ? (
        <audio ref={audioRef} autoPlay />
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/78 via-black/34 to-transparent px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isScreenShare ? (
              trackView?.source === "partial-screen" ? (
                <Scan className="size-4 text-teal-200" />
              ) : (
                <MonitorUp className="size-4 text-teal-200" />
              )
            ) : null}
            <p className="truncate text-sm font-semibold">
              {participant.displayName}
              {participant.isLocal ? " (you)" : ""}
            </p>
          </div>
          <p className="mt-1 text-xs text-white/62">
            {isScreenShare
              ? trackView?.source === "partial-screen"
                ? "Partial screen"
                : "Screen share"
              : participant.isSpeaking
                ? "Speaking"
                : "In meeting"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/10",
              participant.audioTrack && !participant.audioTrack.isMuted
                ? "text-teal-200"
                : "text-rose-200",
            )}
          >
            {participant.audioTrack && !participant.audioTrack.isMuted ? (
              <Mic className="size-4" />
            ) : (
              <MicOff className="size-4" />
            )}
          </span>
          {!showVideo && !isScreenShare ? (
            <span className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-rose-200">
              <VideoOff className="size-4" />
            </span>
          ) : null}
        </div>
      </div>

      {onOpenFullscreen ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-events-auto size-10 rounded-full border-white/25 bg-slate-950/70 text-white opacity-100 backdrop-blur sm:opacity-0 sm:transition sm:group-hover:opacity-100"
            onClick={onOpenFullscreen}
            aria-label="View full screen"
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      ) : null}
    </article>
  );
}
