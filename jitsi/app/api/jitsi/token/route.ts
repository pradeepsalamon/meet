import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";

import { sanitizeRoomSegment } from "@/lib/meeting";

export const runtime = "nodejs";

type TokenRequestBody = {
  displayName?: string;
  roomName?: string;
};

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function normalizePrivateKey(value: string) {
  const key = value.replace(/\\n/g, "\n").trim();

  if (key.includes("BEGIN PRIVATE KEY")) {
    return key;
  }

  const compactKey = key.replace(/\s+/g, "");
  const wrappedKey = compactKey.match(/.{1,64}/g)?.join("\n") ?? compactKey;

  return `-----BEGIN PRIVATE KEY-----\n${wrappedKey}\n-----END PRIVATE KEY-----`;
}

function looksLikeCompletePrivateKey(value?: string) {
  if (!value) {
    return false;
  }

  const key = value.replace(/\\n/g, "\n").trim();

  if (key.includes("BEGIN PRIVATE KEY") && key.includes("END PRIVATE KEY")) {
    return true;
  }

  return key.replace(/\s+/g, "").length > 500;
}

function readMultilinePrivateKeyFromEnvText(text: string) {
  const lines = text.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line.startsWith("JITSI_PRIVATE_KEY="));

  if (keyIndex === -1) {
    return null;
  }

  const firstValue = lines[keyIndex].slice("JITSI_PRIVATE_KEY=".length).trim();
  const parts = [firstValue];

  for (const line of lines.slice(keyIndex + 1)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) {
      break;
    }

    parts.push(trimmed);
  }

  return parts.join("");
}

function readMultilinePrivateKeyFromEnvLocal() {
  try {
    return readMultilinePrivateKeyFromEnvText(
      readFileSync(join(process.cwd(), ".env.local"), "utf8"),
    );
  } catch {
    return null;
  }
}

function readMultilinePrivateKeyFromEnv() {
  try {
    return readMultilinePrivateKeyFromEnvText(
      readFileSync(join(process.cwd(), ".env"), "utf8"),
    );
  } catch {
    return null;
  }
}

function getPrivateKey() {
  const envKey = process.env.JITSI_PRIVATE_KEY?.trim();

  if (looksLikeCompletePrivateKey(envKey)) {
    return envKey;
  }

  return (
    readMultilinePrivateKeyFromEnvLocal() ??
    readMultilinePrivateKeyFromEnv() ??
    envKey
  );
}

function signJwt(
  payload: Record<string, unknown>,
  privateKey: string,
  keyId: string,
) {
  const header = {
    alg: "RS256",
    kid: keyId,
    typ: "JWT",
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedToken)
    .end()
    .sign(privateKey);

  return `${unsignedToken}.${base64Url(signature)}`;
}

function cleanDisplayName(value: string | null | undefined) {
  const displayName = value?.trim().replace(/\s+/g, " ").slice(0, 64);

  return displayName || "Guest";
}

function createTokenResponse({ name, room }: { name: string; room: string }) {
  const appId = process.env.JITSI_APP_ID?.trim() || process.env.NEXT_PUBLIC_JITSI_APP_ID?.trim();
  const keyId = process.env.JITSI_API_KEY_ID?.trim();
  const privateKey = getPrivateKey();

  if (!room) {
    return Response.json({ error: "Missing Jitsi room name." }, { status: 400 });
  }

  if (!appId || !keyId || !privateKey) {
    return Response.json(
      {
        error:
          "Missing JaaS credentials. Set JITSI_APP_ID, JITSI_API_KEY_ID, and JITSI_PRIVATE_KEY.",
      },
      { status: 503 },
    );
  }

  if (!looksLikeCompletePrivateKey(privateKey)) {
    return Response.json(
      {
        error:
          "JITSI_PRIVATE_KEY looks truncated. Keep it as one quoted env value with escaped newlines, or paste the full base64 key body on one line.",
      },
      { status: 500 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = Number.parseInt(process.env.JITSI_TOKEN_TTL_SECONDS ?? "3600", 10);
  const expiresAt = now + (Number.isFinite(ttl) && ttl > 60 ? ttl : 3600);
  const payload = {
    aud: "jitsi",
    context: {
      user: {
        id: randomUUID(),
        name,
        moderator: "true",
      },
      features: {
        livestreaming: false,
        recording: false,
        transcription: false,
        "outbound-call": false,
      },
      room: {
        regex: false,
      },
    },
    exp: expiresAt,
    iss: "chat",
    nbf: now - 10,
    room,
    sub: appId,
  };

  try {
    return Response.json({
      appId,
      expiresAt,
      roomName: room,
      token: signJwt(payload, normalizePrivateKey(privateKey), keyId),
    });
  } catch {
    return Response.json(
      { error: "Could not sign the Jitsi token. Check JITSI_PRIVATE_KEY format." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: TokenRequestBody | undefined;

  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const room = sanitizeRoomSegment(body?.roomName ?? "");
  const name = cleanDisplayName(body?.displayName);

  return createTokenResponse({ name, room });
}

export async function GET(request: NextRequest) {
  const room = sanitizeRoomSegment(request.nextUrl.searchParams.get("room") ?? "");
  const name = cleanDisplayName(request.nextUrl.searchParams.get("name"));

  return createTokenResponse({ name, room });
}
