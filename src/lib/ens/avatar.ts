/** Converts directly previewable ENS avatar records into browser image URLs. */
export function avatarImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
  if (!trimmed.toLowerCase().startsWith("ipfs://")) return null;

  const path = trimmed.slice("ipfs://".length).replace(/^ipfs\//i, "");
  return path ? `https://ipfs.io/ipfs/${path}` : null;
}
