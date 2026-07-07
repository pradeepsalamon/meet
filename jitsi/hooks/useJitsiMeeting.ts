"use client";

/* eslint-disable react-hooks/exhaustive-deps -- Jitsi connections, tracks, and event handlers are owned through refs so toggles do not recreate the room. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildJitsiConferenceOptions,
  buildJitsiConnectionOptions,
  isJaasDomain,
} from "@/lib/jitsi/config";
import { loadJitsiMeetJS } from "@/lib/jitsi/loader";
import type {
  JitsiConference,
  JitsiConnection,
  JitsiEventHandler,
  JitsiLocalTrack,
  JitsiMeetJSStatic,
  JitsiParticipant,
  JitsiTrack,
  JitsiTrackSource,
} from "@/lib/jitsi/types";
import { getJitsiAppId, getJitsiDomain, getJitsiRoomName } from "@/lib/meeting";
import {
  createPartialScreenShareEffect,
  type CropArea,
} from "@/lib/partialScreenShare";

const LOCAL_PARTICIPANT_ID = "local";
const CHAT_ENDPOINT_TYPE = "blueroom-chat";

export type JitsiConnectionStatus =
  | "idle"
  | "loading"
  | "permissions"
  | "connecting"
  | "joining"
  | "connected"
  | "disconnected"
  | "error";

export type JitsiChatMessage = {
  id: string;
  body: string;
  sender: string;
  timestamp: number;
};

export type JitsiTrackView = {
  id: string;
  isLocal: boolean;
  isMuted: boolean;
  participantId: string;
  source: JitsiTrackSource;
  track: JitsiTrack;
  type: "audio" | "video";
};

export type JitsiParticipantView = {
  id: string;
  audioLevel: number;
  audioTrack: JitsiTrackView | null;
  displayName: string;
  isLocal: boolean;
  isSpeaking: boolean;
  screenTrack: JitsiTrackView | null;
  videoTrack: JitsiTrackView | null;
};

type TokenResponse = {
  appId?: string;
  error?: string;
  expiresAt?: number;
  roomName?: string;
  token?: string;
};

function createLocalParticipant(displayName: string): JitsiParticipantView {
  return {
    audioLevel: 0,
    audioTrack: null,
    displayName,
    id: LOCAL_PARTICIPANT_ID,
    isLocal: true,
    isSpeaking: false,
    screenTrack: null,
    videoTrack: null,
  };
}

function normalizeDisplayName(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "Guest";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function coerceChatMessage(value: unknown): JitsiChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : "";
  const body = typeof value.body === "string" ? value.body : "";
  const sender = typeof value.sender === "string" ? value.sender : "";
  const timestamp = typeof value.timestamp === "number" ? value.timestamp : 0;

  if (!id || !body || !sender || !timestamp) {
    return null;
  }

  return { body, id, sender, timestamp };
}

function extractEndpointChatMessage(args: unknown[]): JitsiChatMessage | null {
  for (const arg of args) {
    if (typeof arg === "string") {
      try {
        const parsed = JSON.parse(arg) as unknown;
        const parsedMessage: JitsiChatMessage | null = extractEndpointChatMessage([parsed]);

        if (parsedMessage) {
          return parsedMessage;
        }
      } catch {}
    }

    if (!isRecord(arg)) {
      continue;
    }

    if (arg.type === CHAT_ENDPOINT_TYPE) {
      const message: JitsiChatMessage | null = coerceChatMessage(arg.message);

      if (message) {
        return message;
      }
    }

    if ("data" in arg) {
      const message: JitsiChatMessage | null = extractEndpointChatMessage([arg.data]);

      if (message) {
        return message;
      }
    }

    if ("message" in arg) {
      const message: JitsiChatMessage | null = extractEndpointChatMessage([arg.message]);

      if (message) {
        return message;
      }
    }
  }

  return null;
}

function getParticipantName(participantId: string, participant?: JitsiParticipant) {
  return (
    participant?.getDisplayName?.()?.trim() ||
    `Guest ${participantId.replace(/[^a-z0-9]/gi, "").slice(0, 6) || "member"}`
  );
}

function getTrackSource(track: JitsiTrack, override?: JitsiTrackSource): JitsiTrackSource {
  if (override) {
    return override;
  }

  if (track.getType() === "audio") {
    return "microphone";
  }

  return track.getVideoType?.() === "desktop" ? "screen" : "camera";
}

export function useJitsiMeeting({
  roomId,
  userName,
}: {
  roomId: string;
  userName?: string;
}) {
  const displayName = useMemo(() => normalizeDisplayName(userName), [userName]);
  const hasUserName = Boolean(userName?.trim());
  const domain = getJitsiDomain();
  const appId = getJitsiAppId();
  const jitsiRoomName = getJitsiRoomName(roomId);
  const configurationError =
    isJaasDomain(domain) && !appId
      ? "NEXT_PUBLIC_JITSI_APP_ID is required when NEXT_PUBLIC_JITSI_DOMAIN is 8x8.vc."
      : null;
  const [participants, setParticipants] = useState<JitsiParticipantView[]>(() => [
    createLocalParticipant(displayName),
  ]);
  const [status, setStatus] = useState<JitsiConnectionStatus>(
    hasUserName ? "loading" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isDataChannelOpen, setIsDataChannelOpen] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [screenShareMode, setScreenShareMode] = useState<"none" | "screen" | "partial">(
    "none",
  );
  const [chatMessages, setChatMessages] = useState<JitsiChatMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  const jitsiRef = useRef<JitsiMeetJSStatic | null>(null);
  const connectionRef = useRef<JitsiConnection | null>(null);
  const conferenceRef = useRef<JitsiConference | null>(null);
  const localTracksRef = useRef<{
    audio: JitsiLocalTrack | null;
    screen: JitsiLocalTrack | null;
    video: JitsiLocalTrack | null;
  }>({
    audio: null,
    screen: null,
    video: null,
  });
  const trackIdsRef = useRef(new Map<JitsiTrack, string>());
  const trackCleanupRef = useRef(new Map<JitsiTrack, () => void>());
  const conferenceCleanupRef = useRef<(() => void)[]>([]);
  const isCleaningUpRef = useRef(false);
  const isJoinedRef = useRef(false);
  const trackSequenceRef = useRef(0);
  const dataChannelOpenRef = useRef(false);

  const addChatMessages = useCallback((nextMessages: JitsiChatMessage[]) => {
    setChatMessages((current) => {
      const seenIds = new Set(current.map((message) => message.id));
      const merged = [...current];

      for (const message of nextMessages) {
        if (!seenIds.has(message.id)) {
          seenIds.add(message.id);
          merged.push(message);
        }
      }

      return merged.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  function getTrackId(track: JitsiTrack, source: JitsiTrackSource) {
    const existing = trackIdsRef.current.get(track);

    if (existing) {
      return existing;
    }

    const id =
      track.getId?.() ??
      `${track.getParticipantId() || LOCAL_PARTICIPANT_ID}:${source}:${trackSequenceRef.current + 1}`;

    trackSequenceRef.current += 1;
    trackIdsRef.current.set(track, id);

    return id;
  }

  function upsertParticipant(nextParticipant: JitsiParticipantView) {
    setParticipants((current) => {
      const existingIndex = current.findIndex(
        (participant) => participant.id === nextParticipant.id,
      );

      if (existingIndex === -1) {
        return [...current, nextParticipant];
      }

      return current.map((participant, index) =>
        index === existingIndex
          ? {
              ...participant,
              ...nextParticipant,
              audioTrack: nextParticipant.audioTrack ?? participant.audioTrack,
              screenTrack: nextParticipant.screenTrack ?? participant.screenTrack,
              videoTrack: nextParticipant.videoTrack ?? participant.videoTrack,
            }
          : participant,
      );
    });
  }

  function updateTrackState(
    track: JitsiTrack,
    isLocal: boolean,
    sourceOverride?: JitsiTrackSource,
  ) {
    const source = getTrackSource(track, sourceOverride);
    const participantId = isLocal ? LOCAL_PARTICIPANT_ID : track.getParticipantId();
    const trackView: JitsiTrackView = {
      id: getTrackId(track, source),
      isLocal,
      isMuted: track.isMuted(),
      participantId,
      source,
      track,
      type: track.getType(),
    };

    setParticipants((current) => {
      const existing = current.find((participant) => participant.id === participantId);
      const nextParticipant: JitsiParticipantView =
        existing ??
        ({
          audioLevel: 0,
          audioTrack: null,
          displayName: participantId,
          id: participantId,
          isLocal,
          isSpeaking: false,
          screenTrack: null,
          videoTrack: null,
        } satisfies JitsiParticipantView);

      if (trackView.type === "audio") {
        nextParticipant.audioTrack = trackView;
      } else if (trackView.source === "screen" || trackView.source === "partial-screen") {
        nextParticipant.screenTrack = trackView;
      } else {
        nextParticipant.videoTrack = trackView;
      }

      return existing
        ? current.map((participant) =>
            participant.id === participantId ? nextParticipant : participant,
          )
        : [...current, nextParticipant];
    });
  }

  function removeTrackState(track: JitsiTrack) {
    const trackId = trackIdsRef.current.get(track);

    if (!trackId) {
      return;
    }

    setParticipants((current) =>
      current.map((participant) => ({
        ...participant,
        audioTrack:
          participant.audioTrack?.id === trackId ? null : participant.audioTrack,
        screenTrack:
          participant.screenTrack?.id === trackId ? null : participant.screenTrack,
        videoTrack:
          participant.videoTrack?.id === trackId ? null : participant.videoTrack,
      })),
    );
  }

  function updateTrackMute(track: JitsiTrack) {
    const trackId = trackIdsRef.current.get(track);

    if (!trackId) {
      return;
    }

    setParticipants((current) =>
      current.map((participant) => ({
        ...participant,
        audioTrack:
          participant.audioTrack?.id === trackId
            ? { ...participant.audioTrack, isMuted: track.isMuted() }
            : participant.audioTrack,
        screenTrack:
          participant.screenTrack?.id === trackId
            ? { ...participant.screenTrack, isMuted: track.isMuted() }
            : participant.screenTrack,
        videoTrack:
          participant.videoTrack?.id === trackId
            ? { ...participant.videoTrack, isMuted: track.isMuted() }
            : participant.videoTrack,
      })),
    );

    if (track === localTracksRef.current.audio) {
      setIsMicEnabled(!track.isMuted());
    }

    if (track === localTracksRef.current.video) {
      setIsCameraEnabled(!track.isMuted());
    }
  }

  function updateTrackAudioLevel(track: JitsiTrack, level: unknown) {
    const participantId = track.isLocal() ? LOCAL_PARTICIPANT_ID : track.getParticipantId();
    const audioLevel = typeof level === "number" ? level : 0;

    setParticipants((current) =>
      current.map((participant) =>
        participant.id === participantId
          ? {
              ...participant,
              audioLevel,
              isSpeaking: audioLevel > 0.22,
            }
          : participant,
      ),
    );
  }

  function cleanupTrackEvents(track: JitsiTrack) {
    const cleanup = trackCleanupRef.current.get(track);

    if (cleanup) {
      cleanup();
      trackCleanupRef.current.delete(track);
    }
  }

  function bindTrackEvents(track: JitsiTrack) {
    const jitsi = jitsiRef.current;

    if (!jitsi || trackCleanupRef.current.has(track)) {
      return;
    }

    const cleanupHandlers: Array<() => void> = [];
    const bind = (event: string | undefined, handler: JitsiEventHandler) => {
      if (!event) {
        return;
      }

      track.addEventListener(event, handler);
      cleanupHandlers.push(() => track.removeEventListener(event, handler));
    };

    bind(jitsi.events.track.TRACK_MUTE_CHANGED, () => updateTrackMute(track));
    bind(jitsi.events.track.TRACK_AUDIO_LEVEL_CHANGED, (level) =>
      updateTrackAudioLevel(track, level),
    );
    bind(jitsi.events.track.LOCAL_TRACK_STOPPED, () => {
      if (track === localTracksRef.current.screen) {
        void stopScreenShare();
      }
    });

    trackCleanupRef.current.set(track, () => {
      cleanupHandlers.forEach((cleanup) => cleanup());
    });
  }

  async function disposeLocalTrack(track: JitsiLocalTrack | null) {
    if (!track) {
      return;
    }

    cleanupTrackEvents(track);

    try {
      await track.dispose();
    } catch {}
  }

  async function removeLocalTrackFromRoom(track: JitsiLocalTrack | null) {
    const conference = conferenceRef.current;

    if (!track || !conference?.removeTrack) {
      return;
    }

    try {
      await conference.removeTrack(track);
    } catch {}
  }

  const stopScreenShare = useCallback(async () => {
    const screenTrack = localTracksRef.current.screen;

    if (!screenTrack) {
      setScreenShareMode("none");
      return;
    }

    localTracksRef.current.screen = null;
    await removeLocalTrackFromRoom(screenTrack);

    try {
      await screenTrack.setEffect?.(undefined);
    } catch {}

    removeTrackState(screenTrack);
    await disposeLocalTrack(screenTrack);
    setScreenShareMode("none");
  }, []);

  async function createLocalTrack(device: "audio" | "video" | "desktop") {
    const jitsi = jitsiRef.current;

    if (!jitsi) {
      throw new Error("The Jitsi client is not ready yet.");
    }

    const tracks = await jitsi.createLocalTracks({ devices: [device] });
    const wantedType = device === "audio" ? "audio" : "video";
    const track = tracks.find((candidate) => candidate.getType() === wantedType);

    for (const unusedTrack of tracks) {
      if (unusedTrack !== track) {
        await disposeLocalTrack(unusedTrack);
      }
    }

    if (!track) {
      throw new Error(`Jitsi did not return a ${wantedType} track.`);
    }

    return track;
  }

  async function addLocalTrack(
    track: JitsiLocalTrack,
    sourceOverride?: JitsiTrackSource,
  ) {
    bindTrackEvents(track);

    const conference = conferenceRef.current;

    if (conference && isJoinedRef.current) {
      await conference.addTrack(track);
    }

    updateTrackState(track, true, sourceOverride);
  }

  const toggleMicrophone = useCallback(async () => {
    setError(null);

    try {
      let audioTrack = localTracksRef.current.audio;

      if (!audioTrack) {
        audioTrack = await createLocalTrack("audio");
        localTracksRef.current.audio = audioTrack;
        await addLocalTrack(audioTrack);
        setIsMicEnabled(!audioTrack.isMuted());
        return;
      }

      if (audioTrack.isMuted()) {
        await audioTrack.unmute();
      } else {
        await audioTrack.mute();
      }

      updateTrackMute(audioTrack);
    } catch (error) {
      setError(getErrorMessage(error, "Could not toggle the microphone."));
    }
  }, [isJoined]);

  const toggleCamera = useCallback(async () => {
    setError(null);

    try {
      let videoTrack = localTracksRef.current.video;

      if (!videoTrack) {
        videoTrack = await createLocalTrack("video");
        localTracksRef.current.video = videoTrack;
        await addLocalTrack(videoTrack);
        setIsCameraEnabled(!videoTrack.isMuted());
        return;
      }

      if (videoTrack.isMuted()) {
        await videoTrack.unmute();
      } else {
        await videoTrack.mute();
      }

      updateTrackMute(videoTrack);
    } catch (error) {
      setError(getErrorMessage(error, "Could not toggle the camera."));
    }
  }, [isJoined]);

  const startScreenShare = useCallback(async () => {
    setError(null);

    try {
      await stopScreenShare();
      const screenTrack = await createLocalTrack("desktop");
      localTracksRef.current.screen = screenTrack;
      await addLocalTrack(screenTrack, "screen");
      setScreenShareMode("screen");
    } catch (error) {
      setError(getErrorMessage(error, "Could not start screen sharing."));
    }
  }, [stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (screenShareMode !== "none") {
      await stopScreenShare();
      return;
    }

    await startScreenShare();
  }, [screenShareMode, startScreenShare, stopScreenShare]);

  const createPartialSharePreviewTrack = useCallback(async () => {
    return createLocalTrack("desktop");
  }, []);

  const startPartialScreenShare = useCallback(
    async (previewTrack: JitsiLocalTrack, cropArea: CropArea) => {
      setError(null);

      if (!previewTrack.setEffect) {
        throw new Error("This Jitsi deployment does not expose track effects.");
      }

      try {
        await stopScreenShare();
        await previewTrack.setEffect(createPartialScreenShareEffect({ cropArea }));
        localTracksRef.current.screen = previewTrack;
        await addLocalTrack(previewTrack, "partial-screen");
        setScreenShareMode("partial");
      } catch (error) {
        await disposeLocalTrack(previewTrack);
        throw error;
      }
    },
    [stopScreenShare],
  );

  const leaveMeeting = useCallback(async () => {
    if (isCleaningUpRef.current) {
      return;
    }

    isCleaningUpRef.current = true;
    setStatus("disconnected");
    isJoinedRef.current = false;
    setIsJoined(false);

    const conference = conferenceRef.current;
    const connection = connectionRef.current;

    try {
      await conference?.leave();
    } catch {}

    conferenceCleanupRef.current.forEach((cleanup) => cleanup());
    conferenceCleanupRef.current = [];

    await stopScreenShare();
    await disposeLocalTrack(localTracksRef.current.audio);
    await disposeLocalTrack(localTracksRef.current.video);

    localTracksRef.current.audio = null;
    localTracksRef.current.video = null;

    try {
      await connection?.disconnect();
    } catch {}

    connectionRef.current = null;
    conferenceRef.current = null;
  }, [stopScreenShare]);

  const loadChatMessages = useCallback(async () => {
    setIsLoadingChat(true);

    try {
      const response = await fetch(
        `/api/jitsi/chat?roomId=${encodeURIComponent(jitsiRoomName)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        error?: string;
        messages?: JitsiChatMessage[];
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load chat messages.");
      }

      addChatMessages(data.messages ?? []);
    } catch (error) {
      setError(getErrorMessage(error, "Could not load chat messages."));
    } finally {
      setIsLoadingChat(false);
    }
  }, [addChatMessages, jitsiRoomName]);

  const sendChatMessage = useCallback(
    async (body: string) => {
      const messageBody = body.trim();

      if (!messageBody) {
        return;
      }

      const message: JitsiChatMessage = {
        body: messageBody,
        id: crypto.randomUUID(),
        sender: displayName,
        timestamp: Date.now(),
      };

      addChatMessages([message]);

      const envelope = {
        message,
        type: CHAT_ENDPOINT_TYPE,
      };

      try {
        const conference = conferenceRef.current;

        if (dataChannelOpenRef.current && conference?.broadcastEndpointMessage) {
          conference.broadcastEndpointMessage(envelope);
        } else if (conference?.sendEndpointMessage) {
          conference.sendEndpointMessage(undefined, envelope);
        }
      } catch {
        // The HTTP fallback below keeps chat usable if the Jitsi data channel is unavailable.
      }

      try {
        await fetch("/api/jitsi/chat", {
          body: JSON.stringify({
            message: message.body,
            messageId: message.id,
            roomId: jitsiRoomName,
            sender: message.sender,
            timestamp: message.timestamp,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
      } catch {}
    },
    [addChatMessages, displayName, jitsiRoomName],
  );

  useEffect(() => {
    if (!hasUserName) {
      return;
    }

    if (configurationError) {
      return;
    }

    let cancelled = false;

    async function getToken() {
      if (!appId) {
        return null;
      }

      const response = await fetch("/api/jitsi/token", {
        body: JSON.stringify({
          displayName,
          roomName: jitsiRoomName,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as TokenResponse;

      if (!response.ok || !data.token) {
        throw new Error(data.error ?? "Could not create the Jitsi token.");
      }

      return data.token;
    }

    function bindConferenceEvent(
      conference: JitsiConference,
      event: string | undefined,
      handler: JitsiEventHandler,
    ) {
      if (!event) {
        return;
      }

      conference.on(event, handler);
      conferenceCleanupRef.current.push(() => {
        if (conference.off) {
          conference.off(event, handler);
        } else {
          conference.removeListener?.(event, handler);
        }
      });
    }

    function bindConferenceEvents(conference: JitsiConference, jitsi: JitsiMeetJSStatic) {
      const conferenceEvents = jitsi.events.conference;

      bindConferenceEvent(conference, conferenceEvents.TRACK_ADDED, (track) => {
        const nextTrack = track as JitsiTrack;

        if (nextTrack.isLocal()) {
          return;
        }

        bindTrackEvents(nextTrack);
        updateTrackState(nextTrack, false);
      });

      bindConferenceEvent(conference, conferenceEvents.TRACK_REMOVED, (track) => {
        const nextTrack = track as JitsiTrack;
        cleanupTrackEvents(nextTrack);
        removeTrackState(nextTrack);
      });

      bindConferenceEvent(conference, conferenceEvents.USER_JOINED, (id, participant) => {
        const participantId = typeof id === "string" ? id : "";

        if (!participantId) {
          return;
        }

        upsertParticipant({
          audioLevel: 0,
          audioTrack: null,
          displayName: getParticipantName(participantId, participant as JitsiParticipant),
          id: participantId,
          isLocal: false,
          isSpeaking: false,
          screenTrack: null,
          videoTrack: null,
        });
      });

      bindConferenceEvent(conference, conferenceEvents.USER_LEFT, (id) => {
        if (typeof id !== "string") {
          return;
        }

        setParticipants((current) =>
          current.filter((participant) => participant.id !== id),
        );
      });

      bindConferenceEvent(conference, conferenceEvents.DISPLAY_NAME_CHANGED, (id, name) => {
        if (typeof id !== "string" || typeof name !== "string") {
          return;
        }

        setParticipants((current) =>
          current.map((participant) =>
            participant.id === id ? { ...participant, displayName: name } : participant,
          ),
        );
      });

      bindConferenceEvent(conference, conferenceEvents.DOMINANT_SPEAKER_CHANGED, (id) => {
        if (typeof id !== "string") {
          return;
        }

        setParticipants((current) =>
          current.map((participant) => ({
            ...participant,
            isSpeaking: participant.id === id,
          })),
        );
      });

      bindConferenceEvent(conference, conferenceEvents.ENDPOINT_MESSAGE_RECEIVED, (...args) => {
        const message = extractEndpointChatMessage(args);

        if (message) {
          addChatMessages([message]);
        }
      });

      bindConferenceEvent(conference, conferenceEvents.DATA_CHANNEL_OPENED, () => {
        dataChannelOpenRef.current = true;
        setIsDataChannelOpen(true);
        conference.setReceiverConstraints?.({
          defaultConstraints: { maxHeight: 720 },
          lastN: 25,
        });
      });

      bindConferenceEvent(conference, conferenceEvents.CONFERENCE_JOINED, () => {
        if (cancelled) {
          return;
        }

        setIsJoined(true);
        isJoinedRef.current = true;
        setStatus("connected");
        conference.setDisplayName?.(displayName);
        conference.setSenderVideoConstraint?.(720);
        conference.setReceiverConstraints?.({
          defaultConstraints: { maxHeight: 720 },
          lastN: 25,
        });
      });

      bindConferenceEvent(conference, conferenceEvents.CONFERENCE_LEFT, () => {
        isJoinedRef.current = false;
        setIsJoined(false);
        setStatus("disconnected");
      });
    }

    async function createInitialTracks(jitsi: JitsiMeetJSStatic) {
      setStatus("permissions");

      const createdTracks: JitsiLocalTrack[] = [];

      try {
        createdTracks.push(
          ...(await jitsi.createLocalTracks({ devices: ["audio", "video"] })),
        );
      } catch {
        for (const device of ["audio", "video"] as const) {
          try {
            createdTracks.push(...(await jitsi.createLocalTracks({ devices: [device] })));
          } catch {}
        }
      }

      for (const track of createdTracks) {
        if (track.getType() === "audio") {
          localTracksRef.current.audio = track;
          setIsMicEnabled(!track.isMuted());
        } else if (track.getVideoType?.() !== "desktop") {
          localTracksRef.current.video = track;
          setIsCameraEnabled(!track.isMuted());
        }

        bindTrackEvents(track);
        updateTrackState(track, true);
      }
    }

    async function connect() {
      isCleaningUpRef.current = false;
      setStatus("loading");
      setError(null);
      isJoinedRef.current = false;
      setIsJoined(false);
      setIsDataChannelOpen(false);
      dataChannelOpenRef.current = false;
      setParticipants([createLocalParticipant(displayName)]);

      try {
        const token = await getToken();
        const jitsi = await loadJitsiMeetJS(domain);
        const options = buildJitsiConnectionOptions({ appId, domain, roomName: jitsiRoomName });

        if (cancelled) {
          return;
        }

        jitsiRef.current = jitsi;
        jitsi.init(options);
        jitsi.setLogLevel?.("error");
        await createInitialTracks(jitsi);

        if (cancelled) {
          return;
        }

        const connection = new jitsi.JitsiConnection(null, token, options);
        connectionRef.current = connection;

        const handleConnectionSuccess = () => {
          const conference = connection.initJitsiConference(
            jitsiRoomName,
            buildJitsiConferenceOptions(),
          );

          conferenceRef.current = conference;
          bindConferenceEvents(conference, jitsi);

          for (const track of [
            localTracksRef.current.audio,
            localTracksRef.current.video,
          ]) {
            if (track) {
              void conference.addTrack(track);
            }
          }

          setStatus("joining");
          conference.join();
        };
        const handleConnectionFailed = (...args: unknown[]) => {
          setStatus("error");
          setError(
            `Could not connect to Jitsi.${args.length ? ` ${String(args[0])}` : ""}`,
          );
        };
        const handleConnectionDisconnected = () => {
          if (isCleaningUpRef.current || cancelled) {
            return;
          }

          setStatus("disconnected");
          isJoinedRef.current = false;
          setIsJoined(false);
        };

        connection.addEventListener(
          jitsi.events.connection.CONNECTION_ESTABLISHED,
          handleConnectionSuccess,
        );
        connection.addEventListener(
          jitsi.events.connection.CONNECTION_FAILED,
          handleConnectionFailed,
        );
        connection.addEventListener(
          jitsi.events.connection.CONNECTION_DISCONNECTED,
          handleConnectionDisconnected,
        );

        conferenceCleanupRef.current.push(() => {
          connection.removeEventListener(
            jitsi.events.connection.CONNECTION_ESTABLISHED,
            handleConnectionSuccess,
          );
          connection.removeEventListener(
            jitsi.events.connection.CONNECTION_FAILED,
            handleConnectionFailed,
          );
          connection.removeEventListener(
            jitsi.events.connection.CONNECTION_DISCONNECTED,
            handleConnectionDisconnected,
          );
        });

        setStatus("connecting");
        await connection.connect();
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setError(getErrorMessage(error, "Could not join this Jitsi meeting."));
      }
    }

    void connect();

    return () => {
      cancelled = true;
      void leaveMeeting();
    };
  }, [
    appId,
    configurationError,
    displayName,
    domain,
    hasUserName,
    jitsiRoomName,
    leaveMeeting,
  ]);

  return {
    appId,
    chatMessages,
    createPartialSharePreviewTrack,
    displayName,
    domain,
    error: configurationError ?? error,
    isCameraEnabled,
    isDataChannelOpen,
    isJoined,
    isLoadingChat,
    isMicEnabled,
    isPartialScreenSharing: screenShareMode === "partial",
    isScreenSharing: screenShareMode !== "none",
    jitsiRoomName,
    leaveMeeting,
    loadChatMessages,
    participants,
    roomId,
    screenShareMode,
    sendChatMessage,
    startPartialScreenShare,
    status: configurationError ? "error" : status,
    stopScreenShare,
    toggleCamera,
    toggleMicrophone,
    toggleScreenShare,
  };
}
