import type { JitsiConferenceOptions, JitsiConnectionOptions } from "@/lib/jitsi/types";

export function isJaasDomain(domain: string) {
  return domain === "8x8.vc" || domain.endsWith(".8x8.vc");
}

const sharedConferenceOptions = {
  channelLastN: 25,
  constraints: {
    video: {
      height: { ideal: 720, max: 720, min: 180 },
      width: { ideal: 1280, max: 1280, min: 320 },
    },
  },
  p2p: {
    enabled: false,
  },
};

export function buildJitsiConferenceOptions(): JitsiConferenceOptions {
  return {
    ...sharedConferenceOptions,
    openBridgeChannel: true,
  };
}

export function buildJitsiConnectionOptions({
  appId,
  domain,
  roomName,
}: {
  appId: string;
  domain: string;
  roomName: string;
}): JitsiConnectionOptions {
  const encodedRoom = encodeURIComponent(roomName);
  const sharedOptions = {
    ...sharedConferenceOptions,
    clientNode: "http://jitsi.org/jitsimeet",
    logging: {
      defaultLogLevel: "error",
    },
  };

  if (appId) {
    return {
      ...sharedOptions,
      hosts: {
        domain,
        focus: `focus.${domain}`,
        muc: `conference.${appId}.${domain}`,
      },
      hiddenDomain: `recorder.${domain}`,
      serviceUrl: `wss://${domain}/${appId}/xmpp-websocket?room=${encodedRoom}`,
      websocketKeepAliveUrl: `https://${domain}/${appId}/_unlock?room=${encodedRoom}`,
    };
  }

  return {
    ...sharedOptions,
    bosh: `https://${domain}/http-bind`,
    hosts: {
      domain,
      focus: `focus.${domain}`,
      muc: `conference.${domain}`,
    },
    serviceUrl: `wss://${domain}/xmpp-websocket`,
  };
}
