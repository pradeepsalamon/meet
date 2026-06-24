/**
 * Best supported in Chromium-based browsers.
 * Browsers cannot capture an arbitrary desktop rectangle directly, so this
 * feature captures the full selected screen/window first and then crops it
 * through a canvas stream before publishing to LiveKit.
 */

export type CropShape = "rectangle" | "square" | "circle";

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: CropShape;
};

type CreatePartialScreenTrackOptions = {
  sourceStream: MediaStream;
  videoElement: HTMLVideoElement;
  cropArea: CropArea;
  fps?: number;
};

export function isVideoReady(video: HTMLVideoElement | null) {
  return Boolean(
    video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0,
  );
}

function normalizeDimension(value: number, fallback: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : fallback));
}

export async function createPartialScreenTrack({
  sourceStream,
  videoElement,
  cropArea,
  fps = 30,
}: CreatePartialScreenTrackOptions): Promise<{
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
}> {
  const sourceVideoTrack = sourceStream.getVideoTracks()[0];

  if (!sourceVideoTrack) {
    throw new Error("No screen video track was found.");
  }

  if (!isVideoReady(videoElement)) {
    throw new Error("Screen preview is not ready yet.");
  }

  // Keep a dedicated off-DOM video alive for the crop loop so the stream
  // continues updating even after the modal preview unmounts.
  const renderVideo = document.createElement("video");
  renderVideo.muted = true;
  renderVideo.playsInline = true;
  renderVideo.srcObject = sourceStream;

  if (!isVideoReady(renderVideo)) {
    await new Promise<void>((resolve, reject) => {
      const handleLoadedMetadata = () => {
        cleanupListeners();
        resolve();
      };
      const handleError = () => {
        cleanupListeners();
        reject(new Error("Partial share render video could not start."));
      };
      const cleanupListeners = () => {
        renderVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
        renderVideo.removeEventListener("error", handleError);
      };

      renderVideo.addEventListener("loadedmetadata", handleLoadedMetadata, {
        once: true,
      });
      renderVideo.addEventListener("error", handleError, { once: true });
    });
  }

  await renderVideo.play();

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available in this browser.");
  }

  const latestCropArea = { ...cropArea };
  const drawWidth = normalizeDimension(
    latestCropArea.width,
    renderVideo.videoWidth || videoElement.videoWidth,
  );
  const drawHeight =
    latestCropArea.shape === "circle"
      ? drawWidth
      : normalizeDimension(
          latestCropArea.height,
          renderVideo.videoHeight || videoElement.videoHeight,
        );

  canvas.width = drawWidth;
  canvas.height = drawHeight;

  let animationFrameId = 0;
  let isStopped = false;

  const drawFrame = () => {
    if (isStopped) {
      return;
    }

    if (!isVideoReady(renderVideo)) {
      animationFrameId = window.requestAnimationFrame(drawFrame);
      return;
    }

    const sx = Math.max(0, Math.round(latestCropArea.x));
    const sy = Math.max(0, Math.round(latestCropArea.y));
    const sw = normalizeDimension(
      latestCropArea.width,
      renderVideo.videoWidth || videoElement.videoWidth,
    );
    const sh =
      latestCropArea.shape === "circle"
        ? sw
        : normalizeDimension(
            latestCropArea.height,
            renderVideo.videoHeight || videoElement.videoHeight,
          );

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (latestCropArea.shape === "circle") {
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
      renderVideo,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    if (latestCropArea.shape === "circle") {
      context.restore();
    }

    animationFrameId = window.requestAnimationFrame(drawFrame);
  };

  drawFrame();

  const stream = canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0];

  if (!track) {
    window.cancelAnimationFrame(animationFrameId);
    throw new Error("Unable to create a cropped canvas video track.");
  }

  const stop = () => {
    if (isStopped) {
      return;
    }

    isStopped = true;
    window.cancelAnimationFrame(animationFrameId);
    renderVideo.pause();
    renderVideo.srcObject = null;
    stream.getTracks().forEach((streamTrack) => streamTrack.stop());
  };

  sourceVideoTrack.addEventListener("ended", stop, { once: true });

  return {
    stream,
    track,
    stop,
  };
}
