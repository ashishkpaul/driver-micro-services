let cachedToken: string | null = null;

export const TokenManager = {
  set(token: string) {
    cachedToken = token;
    localStorage.setItem('driver_token', token);
  },

  clear() {
    cachedToken = null;
    localStorage.removeItem('driver_token');
  },

  getSync(): string | null {
    if (cachedToken) return cachedToken;
    cachedToken = localStorage.getItem('driver_token');
    return cachedToken;
  },
};
