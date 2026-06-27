const API_URL = import.meta.env.VITE_API_URL || '/api';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: { id: number; first_name: string; username?: string };
        };
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

export function getInitData(): string {
  return window.Telegram?.WebApp?.initData || '';
}

export function getTgUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
}

export function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'X-Telegram-Init-Data': getInitData() }
  });
  return res.json();
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': getInitData()
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}
