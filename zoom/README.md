# BlueRoom Zoom

Google Meet style room UI rebuilt with Next.js 16, TypeScript, Tailwind CSS, and the Zoom Video SDK for web.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Zoom Video SDK
- shadcn-style local UI primitives
- lucide-react icons

## Features

- Landing page with room and username inputs
- Random room generator
- Meeting page at `/meet/[roomId]`
- Server-generated Zoom Video SDK JWT route at `POST /api/zoom/token`
- Custom participant grid with per-tile full screen view
- Mic, camera, screen-share, chat, and leave controls
- Zoom Video SDK chat messages
- Connection status
- Dark mode

## Environment variables

Copy `.env.example` to `.env.local` and fill in your Zoom Video SDK credentials:

```env
ZOOM_VIDEO_SDK_KEY=
ZOOM_VIDEO_SDK_SECRET=
ZOOM_VIDEO_SDK_SESSION_PASSCODE=
```

`ZOOM_VIDEO_SDK_SESSION_PASSCODE` is optional. Keep the key and secret on the server only.

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
4. The client calls `POST /api/zoom/token`
5. The API signs a Zoom Video SDK JWT using `ZOOM_VIDEO_SDK_KEY` and `ZOOM_VIDEO_SDK_SECRET`
6. The browser loads `@zoom/videosdk`, initializes the client, and joins the session
7. Users in the same room URL communicate through Zoom media, screen share, and chat
