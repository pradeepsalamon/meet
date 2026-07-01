import { createHmac } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TokenRequestBody = {
  sessionName?: string;
  userName?: string;
  role?: number;
};

const ZOOM_VIDEO_SDK_KEY = process.env.ZOOM_VIDEO_SDK_KEY;
const ZOOM_VIDEO_SDK_SECRET = process.env.ZOOM_VIDEO_SDK_SECRET;
const ZOOM_VIDEO_SDK_SESSION_PASSCODE =
  process.env.ZOOM_VIDEO_SDK_SESSION_PASSCODE ?? "";

function sanitizeValue(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function signVideoSdkToken({
  sessionName,
  userName,
  role,
}: {
  sessionName: string;
  userName: string;
  role: 0 | 1;
}) {
  if (!ZOOM_VIDEO_SDK_KEY || !ZOOM_VIDEO_SDK_SECRET) {
    throw new Error("Missing Zoom Video SDK credentials.");
  }

  const issuedAt = Math.floor(Date.now() / 1000) - 30;
  const expiresAt = issuedAt + 60 * 60 * 2;
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const payload = {
    app_key: ZOOM_VIDEO_SDK_KEY,
    iat: issuedAt,
    exp: expiresAt,
    tpc: sessionName,
    role_type: role,
    user_identity: userName,
    version: 1,
  };
  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(payload),
  )}`;
  const signature = createHmac("sha256", ZOOM_VIDEO_SDK_SECRET)
    .update(unsignedToken)
    .digest("base64url");

  return `${unsignedToken}.${signature}`;
}

export async function POST(request: Request) {
  if (!ZOOM_VIDEO_SDK_KEY || !ZOOM_VIDEO_SDK_SECRET) {
    return NextResponse.json(
      {
        error:
          "Missing Zoom Video SDK environment variables. Set ZOOM_VIDEO_SDK_KEY and ZOOM_VIDEO_SDK_SECRET.",
      },
      { status: 500 },
    );
  }

  let body: TokenRequestBody;

  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionName = sanitizeValue(body.sessionName ?? "", 120);
  const userName = sanitizeValue(body.userName ?? "", 64);
  const role = body.role === 0 ? 0 : 1;

  if (!sessionName || !userName) {
    return NextResponse.json(
      { error: "sessionName and userName are required." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      sessionName,
      userName,
      passcode: ZOOM_VIDEO_SDK_SESSION_PASSCODE,
      token: signVideoSdkToken({
        sessionName,
        userName,
        role,
      }),
    });
  } catch (error) {
    console.error("Failed to generate Zoom Video SDK token", error);

    return NextResponse.json(
      { error: "Could not generate Zoom Video SDK token." },
      { status: 500 },
    );
  }
}
