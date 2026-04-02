import { config } from '../config.js';

interface TokenResponse {
  access_token: string;
  expires_at: number; // unix timestamp in ms
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const { clientId, clientSecret, scope, authUrl } = config.gigachat;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'RqUID': crypto.randomUUID(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `scope=${scope}`,
    // GigaChat uses self-signed certs in some environments
    // @ts-expect-error Node.js specific option
    dispatcher: undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GigaChat auth failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TokenResponse;

  cachedToken = {
    token: data.access_token,
    expiresAt: data.expires_at,
  };

  return cachedToken.token;
}
