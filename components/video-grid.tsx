"use client";

import {
  GridLayout,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";

export function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    {
      onlySubscribed: false,
    },
  );

  return (
    <section className="flex flex-1 rounded-[2rem] border border-border/70 bg-card/60 p-3 shadow-inner shadow-slate-950/5 backdrop-blur">
      <GridLayout tracks={tracks} className="h-full min-h-[55vh] w-full gap-3">
        <ParticipantTile />
      </GridLayout>
    </section>
  );
}
