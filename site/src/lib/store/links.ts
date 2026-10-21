// Where things live. The referee profile is a single static page that reads `?id=`, because
// the app is a static export and referee ids only exist at run time.

export const REFEREE_PROFILE_PATH = "/referees/profile";

/** Link to a referee's profile — use this everywhere instead of building the path by hand. */
export function refereeHref(id: string) {
  return `${REFEREE_PROFILE_PATH}?id=${encodeURIComponent(id)}`;
}
