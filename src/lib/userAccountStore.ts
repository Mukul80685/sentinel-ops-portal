/**
 * User account SSOT — profile, settings, authorized users.
 * Syncs with auth / password recovery; consumed by Settings and User Profile modals.
 */

import { useEffect, useState } from "react";
import {
  findRecoveryProfileByEmail,
  getPasswordOverride,
  lookupRecoveryUser,
  recordPasswordReset,
} from "@/lib/passwordRecovery";
import { supabase } from "@/integrations/supabase/client";

export const USER_ACCOUNT_EVENT = "ssacc-user-account";

const STORAGE_KEY = "ssacc_user_account";
const AUTH_USERS_KEY = "ssacc_authorized_users";

export type AuthorizedUser = {
  id: string;
  name: string;
  rank: string;
  armyNumber: string;
};

export type UserAccountState = {
  loginUserId: string;
  displayName: string;
  avatarDataUrl: string | null;
  lastPasswordChange: string | null;
};

const DEFAULT_AUTH_USERS: AuthorizedUser[] = [
  { id: "au-1", name: "Rajesh Mehta", rank: "Colonel", armyNumber: "IC80685A" },
  { id: "au-2", name: "Priya Sharma", rank: "Lieutenant Colonel", armyNumber: "IC80685P" },
  { id: "au-3", name: "Vikram Singh", rank: "Major", armyNumber: "IC80685C" },
  { id: "au-4", name: "Ananya Reddy", rank: "Captain", armyNumber: "IC80685R" },
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
    return users.map(normalizeAuthorizedUser);
  } catch {
    return DEFAULT_AUTH_USERS;
  }
}

export function saveAuthorizedUsers(users: AuthorizedUser[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
  window.dispatchEvent(new Event(USER_ACCOUNT_EVENT));
}

export function findAuthorizedUserByArmyNumber(armyNumber: string): AuthorizedUser | null {
  const norm = armyNumber.trim().toUpperCase();
  return getAuthorizedUsers().find((u) => u.armyNumber.toUpperCase() === norm) ?? null;
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

export async function getCurrentAccountEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.email) return data.session.user.email;
  return null;
}

function recoveryProfileForEmail(email: string) {
  return findRecoveryProfileByEmail(email);
}

export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const override = getPasswordOverride(email);
  if (override && override === password) return true;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export type PasswordChangeInput = {
  email: string;
  currentPassword: string;
  armyNumber: string;
  name: string;
  newPassword: string;
};

export async function changeAccountPassword(input: PasswordChangeInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = findAuthorizedUserByArmyNumber(input.armyNumber);
  if (!authorized) {
    return { ok: false, error: "Army number not found in authorized users list." };
  }
  if (authorized.name.trim().toLowerCase() !== input.name.trim().toLowerCase() &&
      formatAuthorizedUserLabel(authorized).toLowerCase() !== input.name.trim().toLowerCase()) {
    return { ok: false, error: "Name does not match authorized user record." };
  }
  const valid = await verifyCurrentPassword(input.email, input.currentPassword);
  if (!valid) {
    return { ok: false, error: "Current password is incorrect." };
  }
  const profile = recoveryProfileForEmail(input.email) ?? lookupRecoveryUser(getUserAccount().loginUserId);
  if (!profile) {
    return { ok: false, error: "Recovery profile not found for this account." };
  }
  const record = recordPasswordReset(profile, input.newPassword);
  updateUserAccount({ lastPasswordChange: record.resetDate });
  return { ok: true };
}

export function updateLoginUserId(newUserId: string, accountEmail: string): { ok: true } | { ok: false; error: string } {
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
