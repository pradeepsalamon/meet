import type { JitsiLocalTrack, JitsiTrackEffect } from "@/lib/jitsi/types";

/**
 * Browsers cannot capture an arbitrary desktop rectangle directly. This app
 * first captures a user-selected screen/window/tab, then crops that capture in
 * a canvas before publishing the processed video track through Jitsi.
 */

export type CropShape = "rectangle" | "square" | "circle";

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: CropShape;
};

type CanvasOutputTrack = MediaStreamTrack & {
  requestFrame?: () => void;
};

type FramePipelineGenerator = {
  track: MediaStreamTrack;
  writable: WritableStream<VideoFrame>;
  stop: () => void;
};

type FrameProcessedStream = {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
};

function normalizeDimension(value: number, fallback: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : fallback));
}

function isVideoReady(video: HTMLVideoElement | null) {
  return Boolean(
    video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0,
  );
}

function getFramePipelineGenerator(): FramePipelineGenerator | null {
  type GeneratorWithTrack = {
    track?: MediaStreamTrack;
    writable?: WritableStream<VideoFrame>;
    stop?: () => void;
  };

  const frameApi = globalThis as typeof globalThis & {
    MediaStreamTrackGenerator?: new (init: { kind: "video" }) => GeneratorWithTrack;
    VideoTrackGenerator?: new () => GeneratorWithTrack;
  };

  if (frameApi.MediaStreamTrackGenerator) {
    const generator = new frameApi.MediaStreamTrackGenerator({
      kind: "video",
    });
    const track =
      generator instanceof MediaStreamTrack ? generator : generator.track;

    if (track && generator.writable) {
      return {
        track,
        writable: generator.writable,
        stop: () => {
          generator.stop?.();
          track.stop();
        },
      };
    }
  }

  if (frameApi.VideoTrackGenerator) {
    const generator = new frameApi.VideoTrackGenerator();
    const track =
      generator instanceof MediaStreamTrack ? generator : generator.track;

    if (track && generator.writable) {
      return {
        track,
        writable: generator.writable,
        stop: () => {
          generator.stop?.();
          track.stop();
        },
      };
    }
  }

  return null;
}

function createFrameProcessedStream({
  sourceVideoTrack,
  cropArea,
}: {
  sourceVideoTrack: MediaStreamTrack;
  cropArea: CropArea;
}): FrameProcessedStream | null {
  type TrackProcessorConstructor = new (init: {
    track: MediaStreamTrack;
  }) => {
    readable: ReadableStream<VideoFrame>;
  };

  const frameApi = globalThis as typeof globalThis & {
    MediaStreamTrackProcessor?: TrackProcessorConstructor;
  };

  if (
    !frameApi.MediaStreamTrackProcessor ||
    typeof OffscreenCanvas === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return null;
  }

  const generator = getFramePipelineGenerator();

  if (!generator) {
    return null;
  }

  const processor = new frameApi.MediaStreamTrackProcessor({
    track: sourceVideoTrack,
  });
  const reader = processor.readable.getReader();
  const writer = generator.writable.getWriter();
  const drawWidth = normalizeDimension(cropArea.width, 1280);
  const drawHeight =
    cropArea.shape === "circle"
      ? drawWidth
      : normalizeDimension(cropArea.height, 720);
  const canvas = new OffscreenCanvas(drawWidth, drawHeight);
  const context = canvas.getContext("2d");

  if (!context) {
    generator.stop();
    void reader.cancel().catch(() => undefined);
    void writer.abort().catch(() => undefined);
    return null;
  }

  let stopped = false;

  const stopPipeline = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    sourceVideoTrack.removeEventListener("ended", stopPipeline);
    void reader.cancel().catch(() => undefined);
    void writer.close().catch(() => undefined);
    generator.stop();
  };

  const pumpFrames = async () => {
    try {
      while (!stopped) {
        const { done, value } = await reader.read();

        if (done || !value) {
          break;
        }

        try {
          const sx = Math.max(0, Math.round(cropArea.x));
          const sy = Math.max(0, Math.round(cropArea.y));
          const sw = normalizeDimension(
            cropArea.width,
            value.displayWidth || value.codedWidth || drawWidth,
          );
          const sh =
            cropArea.shape === "circle"
              ? sw
              : normalizeDimension(
                  cropArea.height,
                  value.displayHeight || value.codedHeight || drawHeight,
                );

          context.clearRect(0, 0, canvas.width, canvas.height);

          if (cropArea.shape === "circle") {
            context.save();
            context.beginPath();
            context.arc(
              canvas.width / 2,
              canvas.height / 2,
              Math.min(canvas.width, canvas.height) / 2,
              0,
              Math.PI * 2,
            );
            context.closePath();
            context.clip();
          }

          context.drawImage(
            value,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            canvas.width,
            canvas.height,
          );

          if (cropArea.shape === "circle") {
            context.restore();
          }

          const outputFrame = new VideoFrame(canvas, {
            timestamp: value.timestamp,
            alpha: cropArea.shape === "circle" ? "keep" : "discard",
          });

          try {
            await writer.write(outputFrame);
          } finally {
            outputFrame.close();
          }
        } finally {
          value.close();
        }
      }
    } catch {
      // The canvas fallback will be used only when this path cannot start.
    } finally {
      stopPipeline();
    }
  };

  sourceVideoTrack.addEventListener("ended", stopPipeline, { once: true });
  void pumpFrames();

  return {
    stream: new MediaStream([generator.track]),
    track: generator.track,
    stop: stopPipeline,
  };
}

export function createPartialScreenShareEffect({
  cropArea,
  fps = 30,
}: {
  cropArea: CropArea;
  fps?: number;
}): JitsiTrackEffect {
  let outputStream: MediaStream | null = null;
  let renderVideo: HTMLVideoElement | null = null;
  let outputTrack: CanvasOutputTrack | null = null;
  let frameTimerId = 0;
  let videoFrameRequestId = 0;
  let visibilityChangeHandler: (() => void) | null = null;
  let stopFrameProcessing: (() => void) | null = null;
  let activeSourceTrack: MediaStreamTrack | null = null;
  let stopped = false;

  const stopScheduledFrame = () => {
    if (renderVideo && videoFrameRequestId) {
      renderVideo.cancelVideoFrameCallback(videoFrameRequestId);
      videoFrameRequestId = 0;
    }

    if (frameTimerId) {
      window.clearTimeout(frameTimerId);
      frameTimerId = 0;
    }
  };

  const cleanup = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    activeSourceTrack?.removeEventListener("ended", cleanup);
    activeSourceTrack = null;
    stopFrameProcessing?.();
    stopFrameProcessing = null;
    stopScheduledFrame();
    if (visibilityChangeHandler) {
      document.removeEventListener("visibilitychange", visibilityChangeHandler);
      visibilityChangeHandler = null;
    }

    renderVideo?.pause();

    if (renderVideo) {
      renderVideo.srcObject = null;
    }

    outputStream?.getTracks().forEach((track) => track.stop());
    outputStream = null;
    outputTrack = null;
    renderVideo = null;
  };

  return {
    isEnabled(track: JitsiLocalTrack) {
      return track.isVideoTrack?.() ?? track.getType() === "video";
    },
    startEffect(stream: MediaStream) {
      cleanup();
      stopped = false;
      const sourceTrack = stream.getVideoTracks()[0];

      if (!sourceTrack) {
        throw new Error("No screen video track was found for partial sharing.");
      }

      activeSourceTrack = sourceTrack;
      activeSourceTrack.addEventListener("ended", cleanup, { once: true });

      const frameProcessedStream = createFrameProcessedStream({
        sourceVideoTrack: sourceTrack,
        cropArea,
      });

      if (frameProcessedStream) {
        outputStream = frameProcessedStream.stream;
        outputTrack = frameProcessedStream.track;
        stopFrameProcessing = frameProcessedStream.stop;
        return frameProcessedStream.stream;
      }

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      renderVideo = video;

      const canvas = document.createElement("canvas");
      canvas.width = normalizeDimension(cropArea.width, 1280);
      canvas.height =
        cropArea.shape === "circle"
          ? canvas.width
          : normalizeDimension(cropArea.height, 720);

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas 2D context is not available in this browser.");
      }

      const nextOutputStream = canvas.captureStream(fps);
      const nextOutputTrack = nextOutputStream.getVideoTracks()[0] as
        | CanvasOutputTrack
        | undefined;

      if (!nextOutputTrack) {
        throw new Error("Unable to create a cropped canvas video track.");
      }

      outputStream = nextOutputStream;
      outputTrack = nextOutputTrack;

      const frameIntervalMs = Math.max(1000 / Math.max(1, fps), 1000 / 30);
      const shouldUseVideoFrameCallback = () =>
        document.visibilityState === "visible" &&
        "requestVideoFrameCallback" in video;

      const requestOutputFrame = () => {
        try {
          outputTrack?.requestFrame?.();
        } catch {}
      };

      const scheduleNextFrame = () => {
        if (stopped) {
          return;
        }

        if (shouldUseVideoFrameCallback()) {
          videoFrameRequestId = video.requestVideoFrameCallback(() => {
            videoFrameRequestId = 0;
            drawFrame();
          });
          return;
        }

        frameTimerId = window.setTimeout(() => {
          frameTimerId = 0;
          drawFrame();
        }, frameIntervalMs);
      };

      const drawFrame = () => {
        if (stopped) {
          return;
        }

        if (isVideoReady(video)) {
          const sx = Math.max(0, Math.round(cropArea.x));
          const sy = Math.max(0, Math.round(cropArea.y));
          const sw = normalizeDimension(cropArea.width, video.videoWidth);
          const sh =
            cropArea.shape === "circle"
              ? sw
              : normalizeDimension(cropArea.height, video.videoHeight);

          context.clearRect(0, 0, canvas.width, canvas.height);

          if (cropArea.shape === "circle") {
            context.save();
            context.beginPath();
            context.arc(
              canvas.width / 2,
              canvas.height / 2,
              Math.min(canvas.width, canvas.height) / 2,
              0,
              Math.PI * 2,
            );
            context.closePath();
            context.clip();
          }

          context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

          if (cropArea.shape === "circle") {
            context.restore();
          }
        }

        requestOutputFrame();
        scheduleNextFrame();
      };

      visibilityChangeHandler = () => {
        if (stopped) {
          return;
        }

        stopScheduledFrame();
        scheduleNextFrame();
      };

      document.addEventListener("visibilitychange", visibilityChangeHandler);
      void video.play().catch(() => undefined);
      drawFrame();

      return nextOutputStream;
    },
    stopEffect: cleanup,
  };
}
