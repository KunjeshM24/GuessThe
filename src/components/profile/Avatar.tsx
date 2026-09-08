import { generatedAvatar } from "@/lib/profile/avatar";

/**
 * The player's picture, or generated initials when there isn't one.
 *
 * A Google account supplies `avatarUrl`; email signups have none, and upload
 * isn't built. Rendered with a plain <img> rather than next/image because the
 * host is whatever Google hands us — revisit if an image CDN is ever chosen.
 */
export function Avatar({
  username,
  avatarUrl,
  size = 72,
}: {
  username: string;
  avatarUrl: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- external, unknown host */
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        // Don't leak the profile URL to the avatar's host.
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full border-2 border-ink/15 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const { initials, background, foreground } = generatedAvatar(username);

  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-ink/15 font-display"
      style={{
        width: size,
        height: size,
        background,
        color: foreground,
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  );
}
