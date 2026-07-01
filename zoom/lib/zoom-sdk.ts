import type { ZoomVideoNamespace } from "@zoom/videosdk";

let zoomSdkPromise: Promise<ZoomVideoNamespace> | null = null;

export function loadZoomVideoSdk() {
  if (!zoomSdkPromise) {
    zoomSdkPromise = import("@zoom/videosdk").then((module) => module.default ?? module);
  }

  return zoomSdkPromise;
}
