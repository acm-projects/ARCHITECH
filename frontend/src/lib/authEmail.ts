export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidAuthEmail(email: string): boolean {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}
