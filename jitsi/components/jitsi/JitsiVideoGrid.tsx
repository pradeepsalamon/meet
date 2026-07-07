"use client";

import { useMemo, useState } from "react";
import { Minimize2, X } from "lucide-react";

import { JitsiParticipantTile } from "@/components/jitsi/JitsiParticipantTile";
import { Button } from "@/components/ui/button";
import type { JitsiParticipantView, JitsiTrackView } from "@/hooks/useJitsiMeeting";
import { cn } from "@/lib/utils";

type GridTile = {
  id: string;
  participant: JitsiParticipantView;
  trackView: JitsiTrackView | null;
};

export function JitsiVideoGrid({
  participants,
}: {
  participants: JitsiParticipantView[];
}) {
  const [fullscreenTileId, setFullscreenTileId] = useState<string | null>(null);
  const tiles = useMemo<GridTile[]>(() => {
    const screenTiles = participants
      .filter((participant) => participant.screenTrack)
      .map((participant) => ({
        id: participant.screenTrack?.id ?? `${participant.id}:screen`,
        participant,
        trackView: participant.screenTrack,
      }));
    const participantTiles = participants.map((participant) => ({
      id: participant.videoTrack?.id ?? `${participant.id}:camera-placeholder`,
      participant,
      trackView: participant.videoTrack,
    }));

    return [...screenTiles, ...participantTiles];
  }, [participants]);
  const fullscreenTile = useMemo(
    () => tiles.find((tile) => tile.id === fullscreenTileId) ?? null,
    [fullscreenTileId, tiles],
  );

  return (
    <>
      <section className="flex flex-1 rounded-[2rem] border border-border/70 bg-card/60 p-3 shadow-inner shadow-slate-950/5 backdrop-blur">
        <div
          className={cn(
            "grid h-full min-h-[55vh] w-full grid-cols-1 gap-3 overflow-y-auto pr-1",
            tiles.length <= 2
              ? "lg:grid-cols-2"
              : "md:grid-cols-2 xl:grid-cols-3",
          )}
        >
          {tiles.map((tile) => (
            <JitsiParticipantTile
              key={tile.id}
              participant={tile.participant}
              trackView={tile.trackView}
              onOpenFullscreen={() => setFullscreenTileId(tile.id)}
            />
          ))}
        </div>
      </section>

      {fullscreenTile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/92 p-4 backdrop-blur-md">
          <div className="relative flex h-full w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setFullscreenTileId(null)}
              >
                <Minimize2 className="size-4" />
                Exit full screen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => setFullscreenTileId(null)}
                aria-label="Close full screen view"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/40">
              <JitsiParticipantTile
                participant={fullscreenTile.participant}
                trackView={fullscreenTile.trackView}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
