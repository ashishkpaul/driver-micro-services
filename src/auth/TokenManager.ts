// src/auth/TokenManager.ts
let cachedToken: string | null = null;

export const TokenManager = {
  set(token: string) {
    cachedToken = token;
  },

  clear() {
    cachedToken = null;
  },

  getSync(): string | null {
    return cachedToken;
  },
};