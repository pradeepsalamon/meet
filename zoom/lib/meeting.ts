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

export function getConnectionStatusLabel(state: string) {
  switch (state.toLowerCase()) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "closed":
    case "disconnected":
      return "Disconnected";
    case "failed":
      return "Connection failed";
    default:
      return "Idle";
  }
}
