function normalizeNamePart(value?: string | null) {
  return value?.trim() ?? "";
}

export function getAvatarInitials(
  firstName?: string | null,
  lastName?: string | null,
  fallback = "?",
) {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  const initials = `${first.charAt(0)}${last.charAt(0)}`.trim();

  return initials ? initials.toUpperCase() : fallback;
}

export function getPublicAssetUrl(path?: string | null) {
  if (!path) return null;
  if (/^(?:https?:)?\/\//.test(path) || path.startsWith("data:")) return path;
  if (path.startsWith("/")) return path;
  return `/${path}`;
}
