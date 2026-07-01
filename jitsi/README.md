# BlueRoom Jitsi

Google Meet style room UI rebuilt with Next.js 16, TypeScript, Tailwind CSS, and a direct Jitsi Meet room embed.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Direct Jitsi Meet iframe embed
- shadcn-style local UI primitives
- lucide-react icons

## Features

- Landing page with room and username inputs
- Random room generator
- Meeting page at `/meet/[roomId]`
- Embedded Jitsi Meet conference at the configured room URL
- Custom app header with Jitsi in-room controls inside the meeting frame
- Jitsi in-room media, layout, and chat
- Connection status
- Dark mode

## Environment variables

Copy `.env.example` to `.env.local`.

```env
NEXT_PUBLIC_JITSI_DOMAIN=8x8.vc
NEXT_PUBLIC_JITSI_APP_ID=replace_with_jaas_app_id
NEXT_PUBLIC_JITSI_ROOM_PREFIX=blueroom
JITSI_APP_ID=replace_with_jaas_app_id
JITSI_API_KEY_ID=replace_with_jaas_key_id
JITSI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nreplace_with_private_key\n-----END PRIVATE KEY-----"
JITSI_TOKEN_TTL_SECONDS=3600
```

`NEXT_PUBLIC_JITSI_DOMAIN` can point to `8x8.vc` for Jitsi as a Service or your self-hosted Jitsi domain.
`NEXT_PUBLIC_JITSI_APP_ID` is required for JaaS room URLs.
`JITSI_API_KEY_ID` should be the full key id from the JaaS console.
`JITSI_PRIVATE_KEY` signs the server-side JWT from `/api/jitsi/token`.
Keep `JITSI_PRIVATE_KEY` as one env value. Either use escaped newlines as shown above, or put the full base64 key body on one line without line breaks.
`NEXT_PUBLIC_JITSI_ROOM_PREFIX` defaults to `blueroom` and is prepended to app room names. The app also adds a stable short suffix, so public rooms are less generic while `/meet/[roomId]` stays shareable.

Without JaaS credentials, the app can still point to `meet.jit.si` for quick demos, but public `meet.jit.si` embedded calls show the provider warning and disconnect after the demo window.

## Install

```bash
pnpm install
```

or:

```bash
npm install
```

## Build

```bash
pnpm build
```

or:

```bash
npm run build
```

## Run

```bash
pnpm dev
```

Open `http://localhost:3000`.

## How it works

1. Go to `/`
2. Enter a room name and display name
3. Join the session
4. The app opens `/meet/[roomId]`
5. When `NEXT_PUBLIC_JITSI_APP_ID` is set, the meeting page requests `/api/jitsi/token`
6. The server signs a JaaS JWT using `JITSI_API_KEY_ID` and `JITSI_PRIVATE_KEY`
7. The meeting page builds `https://<domain>/<appId>/<room>?jwt=<token>#...`
8. Jitsi owns the in-call toolbar, chat, screen share, tile view, and hangup controls inside the meeting frame
