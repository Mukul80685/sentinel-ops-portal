/**
 * User account SSOT — profile, settings, authorized users, roles.
 * Syncs with local auth / password recovery; consumed by Settings and User Profile modals.
 */

import { useEffect, useState } from "react";
import {
  findRecoveryProfileByEmail,
  getMockSession,
  getPasswordOverride,
  lookupRecoveryUser,
  recordPasswordReset,
} from "@/lib/passwordRecovery";

export const USER_ACCOUNT_EVENT = "ssacc-user-account";

const STORAGE_KEY = "ssacc_user_account";
const AUTH_USERS_KEY = "ssacc_authorized_users";

export type AppRole = "admin" | "operator" | "viewer";

export type AuthorizedUser = {
  id: string;
  name: string;
  rank: string;
  armyNumber: string;
  email: string;
  role: AppRole;
};

export type UserAccountState = {
  loginUserId: string;
  displayName: string;
  avatarDataUrl: string | null;
  lastPasswordChange: string | null;
};

const DEFAULT_AUTH_USERS: AuthorizedUser[] = [
  {
    id: "au-1",
    name: "Rajesh Mehta",
    rank: "Colonel",
    armyNumber: "IC80685A",
    email: "operator@ssacc.demo",
    role: "operator",
  },
  {
    id: "au-2",
    name: "Priya Sharma",
    rank: "Lieutenant Colonel",
    armyNumber: "IC80685P",
    email: "admin@ssacc.demo",
    role: "admin",
  },
  {
    id: "au-3",
    name: "Vikram Singh",
    rank: "Major",
    armyNumber: "IC80685C",
    email: "analyst@ssacc.demo",
    role: "viewer",
  },
  {
    id: "au-4",
    name: "Ananya Reddy",
    rank: "Captain",
    armyNumber: "IC80685R",
    email: "",
    role: "viewer",
  },
];

const DEFAULT_ACCOUNT: UserAccountState = {
  loginUserId: "SSACC@ENTITYB",
  displayName: "",
  avatarDataUrl: null,
  lastPasswordChange: null,
};

const RANK_ALIASES: Record<string, string> = {
  col: "Colonel",
  "lt col": "Lieutenant Colonel",
  maj: "Major",
  capt: "Captain",
};

/** Strip duplicated rank prefix from name for display. */
export function formatAuthorizedUserLabel(u: AuthorizedUser): string {
  const rank = (RANK_ALIASES[u.rank.trim().toLowerCase()] ?? u.rank).trim();
  let name = u.name.trim();
  for (const prefix of [rank, u.rank.trim()]) {
    if (prefix && name.toLowerCase().startsWith(prefix.toLowerCase())) {
      name = name.slice(prefix.length).trim();
      break;
    }
  }
  return rank ? `${rank} ${name}` : name;
}

function normalizeAuthorizedUser(u: AuthorizedUser): AuthorizedUser {
  const rank = RANK_ALIASES[u.rank.trim().toLowerCase()] ?? u.rank.trim();
  let name = u.name.trim();
  for (const prefix of [rank, u.rank.trim(), ...Object.values(RANK_ALIASES)]) {
    if (prefix && name.toLowerCase().startsWith(prefix.toLowerCase())) {
      name = name.slice(prefix.length).trim();
      break;
    }
  }
  return { ...u, rank, name };
}

function applyAuthUserDefaults(u: AuthorizedUser): AuthorizedUser {
  const normalized = normalizeAuthorizedUser(u);
  const seed = DEFAULT_AUTH_USERS.find(
    (d) =>
      d.id === normalized.id ||
      d.armyNumber.toUpperCase() === normalized.armyNumber.toUpperCase(),
  );
  return {
    ...normalized,
    email: normalized.email?.trim() || seed?.email || "",
    role: normalized.role ?? seed?.role ?? "viewer",
  };
}

function loadAccount(): UserAccountState {
  if (typeof window === "undefined") return DEFAULT_ACCOUNT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? ({ ...DEFAULT_ACCOUNT, ...JSON.parse(raw) } as UserAccountState) : DEFAULT_ACCOUNT;
  } catch {
    return DEFAULT_ACCOUNT;
  }
}

function saveAccount(state: UserAccountState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(USER_ACCOUNT_EVENT));
}

export function getUserAccount(): UserAccountState {
  return loadAccount();
}

export function updateUserAccount(patch: Partial<UserAccountState>): UserAccountState {
  const next = { ...loadAccount(), ...patch };
  saveAccount(next);
  return next;
}

export function getAuthorizedUsers(): AuthorizedUser[] {
  if (typeof window === "undefined") return DEFAULT_AUTH_USERS;
  try {
    const raw = localStorage.getItem(AUTH_USERS_KEY);
    const users = raw ? (JSON.parse(raw) as AuthorizedUser[]) : DEFAULT_AUTH_USERS;
    return users.map(applyAuthUserDefaults);
  } catch {
    return DEFAULT_AUTH_USERS;
  }
}

export function saveAuthorizedUsers(users: AuthorizedUser[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users.map(applyAuthUserDefaults)));
  window.dispatchEvent(new Event(USER_ACCOUNT_EVENT));
}

export function findAuthorizedUserByArmyNumber(armyNumber: string): AuthorizedUser | null {
  const norm = armyNumber.trim().toUpperCase();
  return getAuthorizedUsers().find((u) => u.armyNumber.toUpperCase() === norm) ?? null;
}

export function findAuthorizedUserByEmail(email: string): AuthorizedUser | null {
  const norm = email.trim().toLowerCase();
  if (!norm) return null;
  return (
    getAuthorizedUsers().find((u) => u.email.trim().toLowerCase() === norm) ?? null
  );
}

/** Roles for the logged-in account — keyed by email, with service-number fallback. */
export function getRolesForEmail(email: string): AppRole[] {
  const byEmail = findAuthorizedUserByEmail(email);
  if (byEmail) return [byEmail.role];

  const profile = findRecoveryProfileByEmail(email);
  if (profile) {
    const byArmy = findAuthorizedUserByArmyNumber(profile.serviceNumber);
    if (byArmy) return [byArmy.role];
  }

  return [];
}

export function updateAuthorizedUserRole(email: string, role: AppRole): void {
  const trimmedEmail = email.trim();
  const norm = trimmedEmail.toLowerCase();
  const profile = findRecoveryProfileByEmail(trimmedEmail);
  const users = getAuthorizedUsers();

  const idx = users.findIndex(
    (u) =>
      u.email.trim().toLowerCase() === norm ||
      (profile && u.armyNumber.toUpperCase() === profile.serviceNumber.toUpperCase()),
  );

  if (idx >= 0) {
    const next = [...users];
    next[idx] = { ...next[idx], email: trimmedEmail || next[idx].email, role };
    saveAuthorizedUsers(next);
    return;
  }

  if (!profile) return;

  saveAuthorizedUsers([
    ...users,
    {
      id: `au-${Date.now()}`,
      name: profile.userId,
      rank: "",
      armyNumber: profile.serviceNumber,
      email: trimmedEmail,
      role,
    },
  ]);
}

export function upsertAuthorizedUserForSignup(input: {
  email: string;
  userId: string;
  serviceNumber: string;
  fullName?: string;
}): void {
  const email = input.email.trim();
  const users = getAuthorizedUsers();
  const hasRegisteredLogin = users.some((u) => u.email.trim().length > 0);
  const role: AppRole = hasRegisteredLogin ? "viewer" : "admin";

  const existingByArmy = findAuthorizedUserByArmyNumber(input.serviceNumber);
  if (existingByArmy) {
    saveAuthorizedUsers(
      users.map((u) =>
        u.id === existingByArmy.id
          ? {
              ...u,
              email,
              name: input.fullName?.trim() || u.name,
              role: u.email.trim() ? u.role : role,
            }
          : u,
      ),
    );
    return;
  }

  saveAuthorizedUsers([
    ...users,
    {
      id: `au-${Date.now()}`,
      name: input.fullName?.trim() || input.userId.trim(),
      rank: "",
      armyNumber: input.serviceNumber.trim(),
      email,
      role,
    },
  ]);
}

/** Security gate for editing authorized users list. */
export function verifySecurityGate(answers: {
  formationDate: string;
  aiUsed: string;
  motto: string;
}): boolean {
  const dateNorm = answers.formationDate.trim().toLowerCase().replace(/\s+/g, " ");
  const dateOk = dateNorm === "jun 2026" || dateNorm === "june 2026";
  const aiOk = answers.aiUsed.trim().toLowerCase() === "cursor";
  const mottoOk = answers.motto.trim().toLowerCase().replace(/\s+/g, " ") === "teevra chaukas";
  return dateOk && aiOk && mottoOk;
}

export function getCurrentAccountEmail(): string | null {
  return getMockSession()?.email ?? null;
}

function recoveryProfileForEmail(email: string) {
  return findRecoveryProfileByEmail(email);
}

export function verifyCurrentPassword(email: string, password: string): boolean {
  const override = getPasswordOverride(email);
  return override !== null && override === password;
}

export type PasswordChangeInput = {
  email: string;
  currentPassword: string;
  armyNumber: string;
  name: string;
  newPassword: string;
};

export async function changeAccountPassword(
  input: PasswordChangeInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = findAuthorizedUserByArmyNumber(input.armyNumber);
  if (!authorized) {
    return { ok: false, error: "Army number not found in authorized users list." };
  }
  if (
    authorized.name.trim().toLowerCase() !== input.name.trim().toLowerCase() &&
    formatAuthorizedUserLabel(authorized).toLowerCase() !== input.name.trim().toLowerCase()
  ) {
    return { ok: false, error: "Name does not match authorized user record." };
  }
  if (!verifyCurrentPassword(input.email, input.currentPassword)) {
    return { ok: false, error: "Current password is incorrect." };
  }
  const profile =
    recoveryProfileForEmail(input.email) ?? lookupRecoveryUser(getUserAccount().loginUserId);
  if (!profile) {
    return { ok: false, error: "Recovery profile not found for this account." };
  }
  const record = recordPasswordReset(profile, input.newPassword);
  updateUserAccount({ lastPasswordChange: record.resetDate });
  return { ok: true };
}

export function updateLoginUserId(
  newUserId: string,
  accountEmail: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = newUserId.trim();
  if (!trimmed) return { ok: false, error: "User ID cannot be empty." };

  const profilesRaw = localStorage.getItem("ssacc_recovery_profiles");
  const profiles = profilesRaw ? JSON.parse(profilesRaw) : {};
  const account = getUserAccount();
  const oldProfile = lookupRecoveryUser(account.loginUserId);

  if (oldProfile && oldProfile.accountKey.trim().toLowerCase() === accountEmail.trim().toLowerCase()) {
    const updated = { ...oldProfile, userId: trimmed };
    delete profiles[account.loginUserId];
    profiles[trimmed] = updated;
    localStorage.setItem("ssacc_recovery_profiles", JSON.stringify(profiles));
  }

  updateUserAccount({ loginUserId: trimmed });
  return { ok: true };
}

export function useUserAccount(): UserAccountState {
  const [account, setAccount] = useState(loadAccount);
  useEffect(() => {
    const refresh = () => setAccount(loadAccount());
    refresh();
    window.addEventListener(USER_ACCOUNT_EVENT, refresh);
    return () => window.removeEventListener(USER_ACCOUNT_EVENT, refresh);
  }, []);
  return account;
}

export function useAuthorizedUsers(): AuthorizedUser[] {
  const [users, setUsers] = useState(getAuthorizedUsers);
  useEffect(() => {
    const refresh = () => setUsers(getAuthorizedUsers());
    refresh();
    window.addEventListener(USER_ACCOUNT_EVENT, refresh);
    return () => window.removeEventListener(USER_ACCOUNT_EVENT, refresh);
  }, []);
  return users;
}

/** Render circular avatar crop with pan offset (matches preview dimensions). */
export function renderAvatarCropFromImage(
  imageSrc: string,
  naturalW: number,
  naturalH: number,
  offsetX: number,
  offsetY: number,
  size = 256,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const coverScale = Math.max(size / naturalW, size / naturalH);
      const w = naturalW * coverScale;
      const h = naturalH * coverScale;
      const x = (size - w) / 2 + offsetX;
      const y = (size - h) / 2 + offsetY;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x, y, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

/** @deprecated Use renderAvatarCropFromImage via crop dialog */
export async function cropAvatarToCircle(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("load failed"));
      img.src = url;
    });
    return renderAvatarCropFromImage(url, img.naturalWidth, img.naturalHeight, 0, 0, size);
  } finally {
    URL.revokeObjectURL(url);
  }
}
