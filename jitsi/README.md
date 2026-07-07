# BlueRoom Jitsi

Google Meet style room UI rebuilt with Next.js 16, TypeScript, Tailwind CSS, and the low-level `lib-jitsi-meet` API.

## What changed

This app no longer uses a Jitsi iframe as the main meeting experience. The meeting page loads `https://<domain>/libs/lib-jitsi-meet.min.js`, connects with `JitsiMeetJS`, and renders the room with custom React components:

- custom video grid and fullscreen tile view
- custom local and remote participant tiles
- custom mic, camera, screen share, partial share, chat, participant list, and leave controls
- custom chat using Jitsi endpoint messages, with an in-memory app fallback
- Jitsi local/remote track cleanup on leave and repeated toggles
- server-side JaaS JWT generation at `POST /api/jitsi/token`

## Environment variables

Copy `.env.example` to `.env.local`.

```env
# Public Jitsi config
NEXT_PUBLIC_JITSI_DOMAIN=8x8.vc
NEXT_PUBLIC_JITSI_APP_ID=
NEXT_PUBLIC_JITSI_ROOM_PREFIX=nexagen

# Server-side JaaS JWT config
JITSI_APP_ID=
JITSI_API_KEY_ID=
JITSI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----"
JITSI_TOKEN_TTL_SECONDS=3600

# Optional self-hosted config
# NEXT_PUBLIC_JITSI_DOMAIN=meet.yourdomain.com
# NEXT_PUBLIC_JITSI_APP_ID=
```

Only `NEXT_PUBLIC_*` variables are safe for browser use. Never expose `JITSI_PRIVATE_KEY` to the frontend.

For public `meet.jit.si`, JWT is usually not required. For 8x8 JaaS on `8x8.vc`, set `NEXT_PUBLIC_JITSI_APP_ID`, `JITSI_APP_ID`, `JITSI_API_KEY_ID`, and `JITSI_PRIVATE_KEY`.

## Partial screen sharing

Browsers cannot directly capture an arbitrary desktop rectangle. They can capture a full screen, window, or browser tab. The partial-share flow mirrors the LiveKit version where possible:

1. The browser captures the selected screen/window/tab.
2. The app shows a crop selector.
3. The selected crop is rendered into a canvas.
4. Jitsi publishes the processed canvas stream through a `lib-jitsi-meet` track effect.

If the active Jitsi deployment does not expose track effects, the UI reports that limitation instead of pretending partial desktop-region capture works.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Routes

- `/` - join form
- `/meet/[roomId]?user=<name>` - custom Jitsi meeting room
- `POST /api/jitsi/token` - signs a JaaS JWT from server-side env vars
- `GET /api/jitsi/token?room=<room>&name=<name>` - compatibility smoke-check path
- `/api/jitsi/chat` - in-memory fallback chat store
