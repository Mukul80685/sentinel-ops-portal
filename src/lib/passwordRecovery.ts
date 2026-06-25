/**
 * Password recovery — mock/local implementation.
 * Replace storage + validation calls with backend APIs when available.
 */

export type RecoveryUserProfile = {
  /** Case-sensitive operator User ID, e.g. SSACC@ENTITYB */
  userId: string;
  /** Alphanumeric service number, e.g. IC80685P */
  serviceNumber: string;
  securityQuestion: string;
  /** Stored normalized (trim + lowercase) for comparison */
  securityAnswer: string;
  /** Login email used for password override storage */
  accountKey: string;
};

export type PasswordResetRecord = {
  username: string;
  resetDate: string;
  resetTimestamp: string;
  displayLine: string;
};

export type MockSession = {
  email: string;
  userId: string;
  createdAt: number;
};

const STORAGE_PROFILES = "ssacc_recovery_profiles";
const STORAGE_OVERRIDES = "ssacc_password_overrides";
const STORAGE_RESETS = "ssacc_password_resets";
const STORAGE_MOCK_SESSION = "ssacc_mock_session";

export const MOCK_AUTH_EVENT = "ssacc-mock-auth";

const NOTIFICATION_DAYS = 15;

/** Seed demo operators — internal only; never surface in recovery UI */
const DEMO_RECOVERY_USERS: RecoveryUserProfile[] = [
  {
    userId: "SSACC@ENTITYA",
    serviceNumber: "IC80685A",
    securityQuestion: "What is your first school?",
    securityAnswer: "army public school",
    accountKey: "operator@ssacc.demo",
  },
  {
    userId: "SSACC@ENTITYB",
    serviceNumber: "IC80685P",
    securityQuestion: "What is your favorite city?",
    securityAnswer: "new delhi",
    accountKey: "admin@ssacc.demo",
  },
  {
    userId: "SSACC@ENTITYC",
    serviceNumber: "IC80685C",
    securityQuestion: "What was your first posting location?",
    securityAnswer: "leh",
    accountKey: "analyst@ssacc.demo",
  },
];

function normalizeUsername(v: string): string {
  return v.trim().toLowerCase();
}

function normalizeAnswer(v: string): string {
  return v.trim().toLowerCase();
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function loadProfiles(): Record<string, RecoveryUserProfile> {
  const stored = loadJson<Record<string, RecoveryUserProfile>>(STORAGE_PROFILES, {});
  const merged: Record<string, RecoveryUserProfile> = {};
  for (const u of DEMO_RECOVERY_USERS) {
    merged[u.userId] = u;
  }
  return { ...merged, ...stored };
}

export function registerRecoveryProfile(
  userId: string,
  serviceNumber: string,
  accountKey: string,
  securityQuestion: string,
  securityAnswer: string,
): void {
  const profiles = loadJson<Record<string, RecoveryUserProfile>>(STORAGE_PROFILES, {});
  profiles[userId.trim()] = {
    userId: userId.trim(),
    serviceNumber: serviceNumber.trim(),
    accountKey: accountKey.trim(),
    securityQuestion,
    securityAnswer: normalizeAnswer(securityAnswer),
  };
  saveJson(STORAGE_PROFILES, profiles);
}

/** Whether profile has a configured security challenge (question + answer). */
export function profileHasSecurityChallenge(profile: RecoveryUserProfile): boolean {
  return (
    profile.securityQuestion.trim().length > 0 && profile.securityAnswer.trim().length > 0
  );
}

/** Recovery flow includes security step only when a valid challenge is stored. */
export function recoveryRequiresSecurityStep(profile: RecoveryUserProfile): boolean {
  return profileHasSecurityChallenge(profile);
}

/** Register recovery profile when a new account is created */
export function registerRecoveryProfileForSignup(
  username: string,
  recovery: {
    userId: string;
    serviceNumber: string;
    securityQuestion: string;
    securityAnswer: string;
  },
): void {
  registerRecoveryProfile(
    recovery.userId,
    recovery.serviceNumber,
    username,
    recovery.securityQuestion,
    recovery.securityAnswer,
  );
}

/** Dual-identity check — both User ID (case-sensitive) and Service Number must match */
export function verifyDualIdentity(userId: string, serviceNumber: string): RecoveryUserProfile | null {
  const id = userId.trim();
  const svc = serviceNumber.trim();
  if (!id || !svc) return null;
  const user = loadProfiles()[id];
  if (!user || user.serviceNumber !== svc) return null;
  return user;
}

export function lookupRecoveryUser(userId: string): RecoveryUserProfile | null {
  const id = userId.trim();
  if (!id) return null;
  return loadProfiles()[id] ?? null;
}

export function verifySecurityAnswer(userId: string, answer: string): boolean {
  const user = lookupRecoveryUser(userId);
  if (!user || !profileHasSecurityChallenge(user)) return false;
  return user.securityAnswer === normalizeAnswer(answer);
}

export function formatResetDisplayLine(date: Date, timeZone = "Asia/Kolkata"): string {
  const datePart = date.toLocaleDateString("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const tz =
    timeZone === "Asia/Kolkata"
      ? "IST"
      : date
          .toLocaleTimeString("en-GB", { timeZone, timeZoneName: "short" })
          .split(" ")
          .pop() ?? timeZone;
  return `${datePart} | ${timePart} ${tz}`;
}

export function recordPasswordReset(
  profile: RecoveryUserProfile,
  newPassword: string,
  at = new Date(),
): PasswordResetRecord {
  const key = normalizeUsername(profile.accountKey);
  const record: PasswordResetRecord = {
    username: profile.userId,
    resetDate: at.toISOString().slice(0, 10),
    resetTimestamp: at.toISOString(),
    displayLine: formatResetDisplayLine(at),
  };

  const overrides = loadJson<Record<string, string>>(STORAGE_OVERRIDES, {});
  overrides[key] = newPassword;
  saveJson(STORAGE_OVERRIDES, overrides);

  const resets = loadJson<Record<string, PasswordResetRecord>>(STORAGE_RESETS, {});
  resets[key] = record;
  saveJson(STORAGE_RESETS, resets);

  return record;
}

export function getPasswordOverride(username: string): string | null {
  const key = normalizeUsername(username);
  const overrides = loadJson<Record<string, string>>(STORAGE_OVERRIDES, {});
  return overrides[key] ?? null;
}

export function getActiveResetNotification(username: string): PasswordResetRecord | null {
  const key = normalizeUsername(username);
  const resets = loadJson<Record<string, PasswordResetRecord>>(STORAGE_RESETS, {});
  const record = resets[key];
  if (!record) return null;

  const resetAt = new Date(record.resetTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - resetAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > NOTIFICATION_DAYS) return null;
  return record;
}

export function canSignInWithRecoveryOverride(username: string, password: string): boolean {
  const override = getPasswordOverride(username);
  if (!override || override !== password) return false;
  const key = normalizeUsername(username);
  return Object.values(loadProfiles()).some((p) => normalizeUsername(p.accountKey) === key);
}

export function createMockSession(email: string): MockSession {
  const session: MockSession = {
    email: email.trim(),
    userId: `mock-${normalizeUsername(email).replace(/[^a-z0-9]/g, "-")}`,
    createdAt: Date.now(),
  };
  saveJson(STORAGE_MOCK_SESSION, session);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MOCK_AUTH_EVENT));
  }
  return session;
}

export function getMockSession(): MockSession | null {
  return loadJson<MockSession | null>(STORAGE_MOCK_SESSION, null);
}

export function clearMockSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_MOCK_SESSION);
  window.dispatchEvent(new Event(MOCK_AUTH_EVENT));
}
