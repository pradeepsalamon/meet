export type JitsiMediaType = "audio" | "video";
export type JitsiVideoType = "camera" | "desktop";
export type JitsiTrackSource = "microphone" | "camera" | "screen" | "partial-screen";

export type JitsiEventHandler = (...args: unknown[]) => void;

export type JitsiTrackEffect = {
  isEnabled: (track: JitsiLocalTrack) => boolean;
  startEffect: (stream: MediaStream) => MediaStream;
  stopEffect: () => void;
};

export type JitsiTrack = {
  attach: (element: HTMLMediaElement) => void;
  detach: (element?: HTMLMediaElement) => HTMLMediaElement[];
  getId?: () => string;
  getParticipantId: () => string;
  getType: () => JitsiMediaType;
  getVideoType?: () => JitsiVideoType;
  isLocal: () => boolean;
  isMuted: () => boolean;
  addEventListener: (event: string, handler: JitsiEventHandler) => void;
  removeEventListener: (event: string, handler: JitsiEventHandler) => void;
};

export type JitsiLocalTrack = JitsiTrack & {
  dispose: () => Promise<void> | void;
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  isVideoTrack?: () => boolean;
  setEffect?: (effect?: JitsiTrackEffect) => Promise<void> | void;
};

export type JitsiParticipant = {
  getDisplayName?: () => string;
  getId?: () => string;
  getProperty?: (name: string) => unknown;
  isAudioMuted?: () => boolean;
  isVideoMuted?: () => boolean;
};

export type JitsiConnectionOptions = {
  hosts: {
    domain: string;
    focus?: string;
    muc: string;
  };
  analytics?: Record<string, unknown>;
  bosh?: string;
  channelLastN?: number;
  clientNode?: string;
  constraints?: Record<string, unknown>;
  deploymentInfo?: Record<string, unknown>;
  hiddenDomain?: string;
  logging?: Record<string, string>;
  p2p?: Record<string, unknown>;
  serviceUrl?: string;
  websocketKeepAliveUrl?: string;
  [key: string]: unknown;
};

export type JitsiConferenceOptions = {
  channelLastN?: number;
  constraints?: Record<string, unknown>;
  openBridgeChannel?: boolean;
  p2p?: Record<string, unknown>;
  [key: string]: unknown;
};

export type JitsiConference = {
  addTrack: (track: JitsiLocalTrack) => Promise<void> | void;
  removeTrack?: (track: JitsiLocalTrack) => Promise<void> | void;
  join: () => void;
  leave: () => Promise<void> | void;
  myUserId: () => string;
  on: (event: string, handler: JitsiEventHandler) => void;
  off?: (event: string, handler: JitsiEventHandler) => void;
  removeListener?: (event: string, handler: JitsiEventHandler) => void;
  setDisplayName?: (displayName: string) => void;
  setLocalParticipantProperty?: (name: string, value: unknown) => void;
  setReceiverConstraints?: (constraints: Record<string, unknown>) => void;
  setSenderVideoConstraint?: (height: number) => void;
  broadcastEndpointMessage?: (payload: unknown) => void;
  sendEndpointMessage?: (participantId: string | undefined, payload: unknown) => void;
  getParticipantById?: (id: string) => JitsiParticipant | undefined;
};

export type JitsiConnection = {
  addEventListener: (event: string, handler: JitsiEventHandler) => void;
  removeEventListener: (event: string, handler: JitsiEventHandler) => void;
  connect: () => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  initJitsiConference: (
    roomName: string,
    options?: JitsiConferenceOptions,
  ) => JitsiConference;
};

export type JitsiEvents = {
  connection: {
    CONNECTION_DISCONNECTED: string;
    CONNECTION_ESTABLISHED: string;
    CONNECTION_FAILED: string;
  };
  conference: {
    CONFERENCE_JOINED: string;
    CONFERENCE_LEFT: string;
    DATA_CHANNEL_OPENED?: string;
    DISPLAY_NAME_CHANGED?: string;
    DOMINANT_SPEAKER_CHANGED?: string;
    ENDPOINT_MESSAGE_RECEIVED?: string;
    TRACK_ADDED: string;
    TRACK_REMOVED?: string;
    USER_JOINED: string;
    USER_LEFT: string;
  };
  track: {
    LOCAL_TRACK_STOPPED?: string;
    TRACK_AUDIO_LEVEL_CHANGED?: string;
    TRACK_MUTE_CHANGED: string;
  };
};

export type JitsiMeetJSStatic = {
  JitsiConnection: new (
    appId: string | null,
    token: string | null,
    options: JitsiConnectionOptions,
  ) => JitsiConnection;
  createLocalTracks: (options: {
    devices: Array<"audio" | "video" | "desktop">;
    constraints?: Record<string, unknown>;
  }) => Promise<JitsiLocalTrack[]>;
  events: JitsiEvents;
  init: (options?: Record<string, unknown>) => void;
  logLevels?: Record<string, string>;
  setLogLevel?: (level: string) => void;
  setLogLevelById?: (level: string, loggerId: string) => void;
  version?: string;
};

declare global {
  interface Window {
    JitsiMeetJS?: JitsiMeetJSStatic;
  }
}
