export type NameValidationResult = { ok: true } | { ok: false; message: string };

export function validateUsername(username: string): NameValidationResult {
  const u = (username || '').trim();
  if (!u) return { ok: false, message: 'Username is required.' };
  if (u.length < 3 || u.length > 20) return { ok: false, message: 'Username must be 3–20 characters.' };
  if (!/^[A-Za-z0-9._]+$/.test(u)) return { ok: false, message: 'Username can only contain letters, numbers, "." and "_" (no spaces).' };
  if (u.startsWith('.') || u.endsWith('.')) return { ok: false, message: 'Username cannot start or end with ".".' };

  // Lightweight reserved words (not “bad words”). Keep this small.
  const reserved = new Set([
    'admin',
    'support',
    'help',
    'root',
    'staff',
    'proxyme',
    'moderator',
  ]);
  if (reserved.has(u.toLowerCase())) return { ok: false, message: 'Please choose a different username.' };

  return { ok: true };
}

export function validateFullName(fullName: string): NameValidationResult {
  const n = (fullName || '').trim();
  if (!n) return { ok: false, message: 'Full name is required.' };
  if (n.length < 2 || n.length > 40) return { ok: false, message: 'Name must be 2–40 characters.' };
  if (n.toLowerCase().includes('http') || n.includes('@')) return { ok: false, message: 'Name cannot include links or @handles.' };
  return { ok: true };
}

