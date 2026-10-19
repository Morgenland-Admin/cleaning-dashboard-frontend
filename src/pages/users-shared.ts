import type { useT } from '@/i18n';
import type { StaffAccessLevel } from '@/lib/api';

type T = ReturnType<typeof useT>;

export const STAFF_LEVELS: StaffAccessLevel[] = [
  'super_admin',
  'admin',
  'manager',
  'viewer',
  'seo',
];

export function accessLabel(t: T, level: string): string {
  return t(`profile.access.${level}` as never);
}

export function accessHint(t: T, level: StaffAccessLevel): string {
  return t(`users.levelHint.${level}` as never);
}

export function accessTone(level: string): 'info' | 'warning' | 'success' | 'danger' | 'neutral' {
  if (level === 'super_admin') return 'danger';
  if (level === 'admin') return 'warning';
  if (level === 'manager') return 'info';
  return 'neutral';
}

/** Levels the caller may hand out: only a super_admin grants super_admin. */
export function assignableLevels(callerIsSuperAdmin: boolean): StaffAccessLevel[] {
  return callerIsSuperAdmin ? STAFF_LEVELS : STAFF_LEVELS.filter((l) => l !== 'super_admin');
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generatePassword(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

export const PASSWORD_MIN = 8;
