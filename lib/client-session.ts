"use client";

import { signOut } from "next-auth/react";

const PRESERVED_LOCAL_KEYS = new Set([
  "meldex:theme",
  "meldex:userSidebarCollapsed",
  "meldex:sidebarCollapsed",
]);

export function clearMeldexClientCaches() {
  if (typeof window === "undefined") return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => Boolean(key),
    );
    for (const key of keys) {
      if (!key.startsWith("meldex:")) continue;
      if (storage === window.localStorage && PRESERVED_LOCAL_KEYS.has(key)) continue;
      storage.removeItem(key);
    }
  }
}

export async function logoutFromMeldex(callbackUrl = "/login") {
  clearMeldexClientCaches();
  await signOut({ callbackUrl, redirect: true });
}
