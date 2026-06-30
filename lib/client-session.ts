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
  try {
    await signOut({ redirect: false });
  } catch {
    // The server-side cookie clear below is the source of truth.
  }
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // Navigation still moves the user out of protected UI.
  }
  window.location.assign(callbackUrl);
}
