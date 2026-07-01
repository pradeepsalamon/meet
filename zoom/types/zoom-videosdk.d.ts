declare module "@zoom/videosdk" {
  export enum VideoQuality {
    Video_90P = 0,
    Video_180P = 1,
    Video_360P = 2,
    Video_720P = 3,
  }

  export type ZoomParticipant = {
    userId: number;
    displayName?: string;
    userIdentity?: string;
    isHost?: boolean;
    bVideoOn?: boolean;
    muted?: boolean;
    audio?: string;
  };

  export type ZoomVideoElement = HTMLElement | HTMLElement[];

  export type ZoomMediaStream = {
    startAudio: () => Promise<unknown>;
    stopAudio: () => Promise<unknown>;
    muteAudio: () => Promise<unknown>;
    unmuteAudio: () => Promise<unknown>;
    startVideo: (options?: Record<string, unknown>) => Promise<unknown>;
    stopVideo: () => Promise<unknown>;
    attachVideo: (
      userId: number,
      quality?: VideoQuality | number,
    ) => Promise<ZoomVideoElement>;
    detachVideo: (userId: number) => Promise<ZoomVideoElement | void>;
    startShareScreen: (element: HTMLCanvasElement | HTMLVideoElement) => Promise<unknown>;
    stopShareScreen: () => Promise<unknown>;
    startShareView: (
      element: HTMLCanvasElement | HTMLVideoElement,
      userId: number,
    ) => Promise<unknown>;
    stopShareView: () => Promise<unknown>;
  };

  export type ZoomChatMessagePayload = {
    id?: string;
    message?: string;
    text?: string;
    sender?: {
      userId?: number;
      name?: string;
      displayName?: string;
    };
    senderId?: number;
    senderName?: string;
    timestamp?: number;
  };

  export type ZoomChatClient = {
    sendToAll: (message: string) => Promise<unknown>;
  };

  export type ZoomClientEventHandler = (payload: unknown) => void;

  export type ZoomClient = {
    init: (
      language: string,
      region: string,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
    join: (
      sessionName: string,
      token: string,
      userName: string,
      passcode?: string,
    ) => Promise<unknown>;
    leave: (endSession?: boolean) => Promise<unknown>;
    getMediaStream: () => ZoomMediaStream;
    getChatClient: () => ZoomChatClient;
    getAllUser: () => ZoomParticipant[];
    getCurrentUserInfo: () => ZoomParticipant;
    on: (event: string, handler: ZoomClientEventHandler) => void;
    off: (event: string, handler: ZoomClientEventHandler) => void;
  };

  export type ZoomVideoNamespace = {
    createClient: () => ZoomClient;
    VideoQuality?: typeof VideoQuality;
  };

  const ZoomVideo: ZoomVideoNamespace;

  export default ZoomVideo;
}
