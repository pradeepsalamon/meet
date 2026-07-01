"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Video } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getJitsiAppId, getJitsiDomain, getJitsiRoomName } from "@/lib/meeting";

type MeetingRoomProps = {
  roomId: string;
  userName?: string;
};

type TokenState = {
  error: string | null;
  token: string | null;
  url: string;
};

function buildJitsiMeetingUrl({
  appId,
  displayName,
  domain,
  roomName,
  token,
}: {
  appId: string;
  displayName: string;
  domain: string;
  roomName: string;
  token: string | null;
}) {
  const roomPath = appId
    ? `/${encodeURIComponent(appId)}/${encodeURIComponent(roomName)}`
    : `/${encodeURIComponent(roomName)}`;
  const meetingUrl = new URL(`https://${domain}${roomPath}`);
  const hashParams = new URLSearchParams({
    "config.disableDeepLinking": "true",
    "config.disableModeratorIndicator": "true",
    "config.enableWelcomePage": "false",
    "config.prejoinConfig.enabled": "false",
    "config.prejoinPageEnabled": "false",
    "config.startWithAudioMuted": "true",
    "config.startWithVideoMuted": "true",
    "interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS": "true",
    "interfaceConfig.MOBILE_APP_PROMO": "false",
    "interfaceConfig.VIDEO_LAYOUT_FIT": "nocrop",
    "userInfo.displayName": JSON.stringify(displayName),
  });

  if (token) {
    meetingUrl.searchParams.set("jwt", token);
  }

  meetingUrl.hash = hashParams.toString();

  return meetingUrl.toString();
}

export function MeetingRoom({ roomId, userName }: MeetingRoomProps) {
  const hasUserName = Boolean(userName?.trim());
  const displayName = userName?.trim().replace(/\s+/g, " ") ?? "Guest";
  const jitsiDomain = getJitsiDomain();
  const jitsiAppId = getJitsiAppId();
  const jitsiRoomName = useMemo(() => getJitsiRoomName(roomId), [roomId]);
  const tokenUrl = useMemo(() => {
    if (!hasUserName || !jitsiAppId) {
      return null;
    }

    const params = new URLSearchParams({
      name: displayName,
      room: jitsiRoomName,
    });

    return `/api/jitsi/token?${params.toString()}`;
  }, [displayName, hasUserName, jitsiAppId, jitsiRoomName]);
  const [tokenState, setTokenState] = useState<TokenState>({
    error: null,
    token: null,
    url: "",
  });
  const activeToken = tokenState.url === tokenUrl ? tokenState.token : null;
  const tokenError = tokenState.url === tokenUrl ? tokenState.error : null;
  const isTokenLoading = Boolean(tokenUrl && !activeToken && !tokenError);
  const meetingUrl = useMemo(
    () =>
      isTokenLoading || tokenError
        ? null
        : buildJitsiMeetingUrl({
            appId: jitsiAppId,
            displayName,
            domain: jitsiDomain,
            roomName: jitsiRoomName,
            token: activeToken,
          }),
    [
      activeToken,
      displayName,
      isTokenLoading,
      jitsiAppId,
      jitsiDomain,
      jitsiRoomName,
      tokenError,
    ],
  );
  const [loadedFrameUrl, setLoadedFrameUrl] = useState<string | null>(null);
  const isFrameLoaded = Boolean(meetingUrl && loadedFrameUrl === meetingUrl);
  const isPublicMeetDemo = !jitsiAppId && jitsiDomain === "meet.jit.si";

  useEffect(() => {
    if (!tokenUrl) {
      return;
    }

    const controller = new AbortController();
    const requestUrl = tokenUrl;

    async function loadToken() {
      try {
        const response = await fetch(requestUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          error?: string;
          token?: string;
        };

        if (!response.ok || !data.token) {
          throw new Error(data.error ?? "Could not create the Jitsi token.");
        }

        setTokenState({
          error: null,
          token: data.token,
          url: requestUrl,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setTokenState({
          error:
            error instanceof Error
              ? error.message
              : "Could not create the Jitsi token.",
          token: null,
          url: requestUrl,
        });
      }
    }

    void loadToken();

    return () => controller.abort();
  }, [tokenUrl]);

  if (!hasUserName) {
    return (
      <MeetingState
        title="Missing display name"
        message="Please return home, enter your display name, and join again."
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-col gap-4 border-b border-border/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Video className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">BlueRoom Jitsi Session</p>
            <h1 className="text-xl font-semibold tracking-tight">{roomId}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label={
              tokenError
                ? "Config needed"
                : isTokenLoading
                  ? "Signing room"
                  : isFrameLoaded
                    ? "Room loaded"
                    : "Loading room"
            }
          />
          <StatusPill label={`Jitsi: ${jitsiRoomName}`} subtle />
          <StatusPill label={`You: ${displayName}`} subtle />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        {tokenError ? (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {tokenError}
          </div>
        ) : null}

        {isPublicMeetDemo ? (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
            Public meet.jit.si embeds are demo-limited. Add JaaS credentials in
            .env.local to remove the embedded demo warning.
          </div>
        ) : null}

        <section className="jitsi-frame-shell relative flex min-h-0 flex-1 overflow-hidden rounded-[1.5rem] border border-border/70 bg-neutral-950 shadow-2xl shadow-neutral-950/15">
          {!isFrameLoaded ? <MeetingFrameLoader /> : null}
          {meetingUrl ? (
            <iframe
              key={meetingUrl}
              title={`Jitsi meeting ${roomId}`}
              src={meetingUrl}
              allow="camera; microphone; display-capture; fullscreen; clipboard-write; autoplay"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="h-full min-h-[58vh] w-full border-0"
              onLoad={() => setLoadedFrameUrl(meetingUrl)}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function MeetingFrameLoader() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950 text-white">
      <div className="text-center">
        <LoaderCircle className="mx-auto size-10 animate-spin text-primary" />
        <p className="mt-4 text-sm text-white/72">Loading Jitsi Meet...</p>
      </div>
    </div>
  );
}

function MeetingState({
  title = "Joining room",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-card/85 p-8 text-center shadow-2xl shadow-neutral-950/10 backdrop-blur">
        <LoaderCircle className="mx-auto size-10 animate-spin text-primary" />
        <h2 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  subtle = false,
}: {
  label: string;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-full border px-3 py-1.5 text-sm ${
        subtle
          ? "border-border/70 bg-card/80 text-muted-foreground"
          : "border-primary/20 bg-primary/10 text-primary"
      }`}
    >
      {label}
    </div>
  );
}
