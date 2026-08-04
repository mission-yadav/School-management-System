import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/** Access token lives in memory (refresh token is an httpOnly cookie). */
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refresh(): Promise<string | null> {
  try {
    const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    setAccessToken(null);
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = original?.url || '';
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh')
    ) {
      original._retry = true;
      refreshing = refreshing || refresh();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/** Try to restore a session on app load using the refresh cookie. */
export async function bootstrapSession() {
  return refresh();
}

/** Download a file from an authed endpoint (adds bearer, triggers browser save). */
export async function downloadFile(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

export function apiError(e: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(e)) return (e.response?.data as any)?.error || fallback;
  return fallback;
}

export default api;
