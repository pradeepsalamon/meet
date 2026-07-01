export function sanitizeRoomSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9- ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function randomRoomName() {
  const adjective = ["blue", "swift", "calm", "bright", "smart"];
  const noun = ["meeting", "studio", "class", "team", "circle"];
  const suffix = Math.random().toString(36).slice(2, 6);

  return `${adjective[Math.floor(Math.random() * adjective.length)]}-${noun[Math.floor(Math.random() * noun.length)]}-${suffix}`;
}

export function buildMeetingPath(roomId: string, userName: string) {
  const params = new URLSearchParams({
    user: userName.trim(),
  });

  return `/meet/${encodeURIComponent(roomId)}?${params.toString()}`;
}

export function getJitsiDomain() {
  const configuredDomain = process.env.NEXT_PUBLIC_JITSI_DOMAIN?.trim();
  const rawDomain = configuredDomain || (getJitsiAppId() ? "8x8.vc" : "meet.jit.si");

  return rawDomain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function getJitsiAppId() {
  const rawAppId = process.env.NEXT_PUBLIC_JITSI_APP_ID?.trim();

  return rawAppId?.replace(/^\/+/, "").replace(/\/.*$/, "").trim() ?? "";
}

function stableRoomSuffix(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

export function getJitsiRoomName(roomId: string) {
  const rawPrefix = process.env.NEXT_PUBLIC_JITSI_ROOM_PREFIX?.trim() || "blueroom";
  const prefix = sanitizeRoomSegment(rawPrefix) || "blueroom";
  const room = sanitizeRoomSegment(roomId) || "meeting";

  return `${prefix}-${room}-${stableRoomSuffix(room)}`;
}
