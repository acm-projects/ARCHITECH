// A cookie rather than local storage, so the server leaves a dismissed strip out of the first
// paint. It stores the challenge id, which brings the strip back when the challenge changes.
export const DISMISSED_CHALLENGE_COOKIE = "architech.dismissed-challenge";

const ONE_YEAR_SECONDS = 31_536_000;

export function dismissalCookie(challengeId: string, secure: boolean): string {
  const attributes = `Path=/dashboard; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  return `${DISMISSED_CHALLENGE_COOKIE}=${encodeURIComponent(challengeId)}; ${attributes}${secure ? "; Secure" : ""}`;
}

export function isChallengeDismissed(cookieValue: string | undefined, challengeId: string): boolean {
  return cookieValue === challengeId;
}
