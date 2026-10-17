export function isMediumAuthenticationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "medium.com" && hostname !== "www.medium.com") return false;

    const path = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    return /^\/(?:m\/)?(?:signin|sign-in|signup|sign-up|login|log-in|register|join)$/.test(path)
      || /^(?:register|login|signup|signin)$/i.test(url.searchParams.get("operation") || "");
  } catch {
    return false;
  }
}
