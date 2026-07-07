"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorUp, RectangleHorizontal, Square, X } from "lucide-react";

import { PartialScreenPreview } from "@/components/PartialScreenPreview";
import { Button } from "@/components/ui/button";
import type { JitsiLocalTrack } from "@/lib/jitsi/types";
import type { CropArea, CropShape } from "@/lib/partialScreenShare";

type JitsiPartialScreenShareModalProps = {
  open: boolean;
  onClose: () => void;
  onCreatePreviewTrack: () => Promise<JitsiLocalTrack>;
  onStartPartialShare: (track: JitsiLocalTrack, cropArea: CropArea) => Promise<void>;
};

function createDefaultCropArea(
  width: number,
  height: number,
  shape: CropShape,
): CropArea {
  const baseWidth = width * 0.5;
  const baseHeight = height * 0.45;
  const size = Math.min(width, height) * 0.4;
  const cropWidth = shape === "rectangle" ? baseWidth : size;
  const cropHeight = shape === "rectangle" ? baseHeight : size;

  return {
    height: cropHeight,
    shape,
    width: cropWidth,
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
  };
}

function normalizeShape(area: CropArea, shape: CropShape): CropArea {
  if (shape === "rectangle") {
    return { ...area, shape };
  }

  const size = Math.max(24, Math.max(area.width, area.height));

  return {
    ...area,
    height: size,
    shape,
    width: size,
  };
}

function waitForVideoReady(video: HTMLVideoElement) {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const handleLoadedMetadata = () => {
      cleanupListeners();
      resolve();
    };
    const handleError = () => {
      cleanupListeners();
      reject(new Error("Screen preview could not be loaded."));
    };
    const cleanupListeners = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

export function JitsiPartialScreenShareModal({
  open,
  onClose,
  onCreatePreviewTrack,
  onStartPartialShare,
}: JitsiPartialScreenShareModalProps) {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewTrackRef = useRef<JitsiLocalTrack | null>(null);
  const [shape, setShape] = useState<CropShape>("rectangle");
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [hasSource, setHasSource] = useState(false);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const track = previewTrackRef.current;
      const video = previewVideoRef.current;

      if (track) {
        if (video) {
          track.detach(video);
        }

        void track.dispose();
      }

      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, []);

  if (!open) {
    return null;
  }

  function resetPreviewState() {
    setHasSource(false);
    setIsPreviewReady(false);
    setCropArea(null);
  }

  function stopPreviewSelection() {
    const track = previewTrackRef.current;
    const video = previewVideoRef.current;

    if (track) {
      if (video) {
        track.detach(video);
      }

      void track.dispose();
    }

    previewTrackRef.current = null;

    if (video) {
      video.pause();
      video.srcObject = null;
    }

    resetPreviewState();
  }

  async function handleSelectScreen() {
    setIsSelecting(true);
    setError(null);

    try {
      stopPreviewSelection();

      const previewTrack = await onCreatePreviewTrack();
      const video = previewVideoRef.current;

      if (!video) {
        await previewTrack.dispose();
        throw new Error("Preview video element is not available.");
      }

      previewVideoRef.current = video;
      previewTrackRef.current = previewTrack;
      video.muted = true;
      video.playsInline = true;
      previewTrack.attach(video);

      await waitForVideoReady(video);
      await video.play();

      setHasSource(true);
      setIsPreviewReady(true);
    } catch (error) {
      stopPreviewSelection();
      setError(error instanceof Error ? error.message : "Screen selection was cancelled.");
    } finally {
      setIsSelecting(false);
    }
  }

  async function handleStartPartialShare() {
    const previewTrack = previewTrackRef.current;
    const video = previewVideoRef.current;

    if (!previewTrack || !cropArea || !video) {
      setError("Select a screen and crop area first.");
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      previewTrack.detach(video);
      await onStartPartialShare(previewTrack, cropArea);
      previewTrackRef.current = null;
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to publish partial screen share.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[2rem] border border-border/70 bg-card/95 p-5 shadow-2xl shadow-black/30 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Partial screen share</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Select a screen area to publish
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              The browser captures the full selected screen, window, or tab first.
              This app crops that capture in a canvas effect before publishing it
              through Jitsi.
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-500">
              Do not select this same browser tab or window. Choose another app,
              monitor, or browser tab to avoid recursive preview flicker.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4 rounded-2xl border border-border/70 bg-background/65 p-4">
            <Button
              className="w-full justify-center"
              onClick={handleSelectScreen}
              disabled={isSelecting}
            >
              <MonitorUp className="size-4" />
              {isSelecting ? "Selecting..." : "Select Screen"}
            </Button>

            <div>
              <p className="text-sm font-medium">Shape</p>
              <div className="mt-3 grid gap-2">
                {(
                  [
                    ["rectangle", "Rectangle", RectangleHorizontal],
                    ["square", "Square", Square],
                    ["circle", "Circle", CircleIcon],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <Button
                    key={value}
                    variant={shape === value ? "default" : "secondary"}
                    className="justify-start"
                    onClick={() => {
                      setShape(value);

                      if (cropArea) {
                        setCropArea(normalizeShape(cropArea, value));
                      }
                    }}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleStartPartialShare}
                disabled={!hasSource || !isPreviewReady || !cropArea || isPublishing}
              >
                {isPublishing ? "Starting..." : "Start Partial Share"}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={stopPreviewSelection}
                disabled={!hasSource}
              >
                Stop
              </Button>
              <Button variant="ghost" className="w-full" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </aside>

          <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
            <PartialScreenPreview
              cropArea={cropArea}
              hasSource={hasSource}
              isPreviewReady={isPreviewReady}
              shape={shape}
              videoRef={previewVideoRef}
              onCropChange={(nextArea) => setCropArea({ ...nextArea, shape })}
              onVideoReady={({ width, height }) => {
                setCropArea((current) =>
                  current
                    ? normalizeShape(current, shape)
                    : createDefaultCropArea(width, height, shape),
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
