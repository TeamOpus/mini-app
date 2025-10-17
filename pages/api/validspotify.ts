import { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'crypto';

const SPOTIFY_CLIENT_ID = "95f4f5c6df5744698035a0948e801ad9";
const SPOTIFY_CLIENT_SECRET = "4b03167b38c943c3857333b3f5ea95ea";
const TOKEN_JSON_URL = 'https://raw.githubusercontent.com/itzzzme/spotify-key/refs/heads/main/token.json';
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36";

// Token management
let cachedTokens: string[] = [];
let currentTokenIndex = 0;
let tokenCache: { token: string; expiresAt: number } | null = null;

// Utility: HMAC SHA256
function createHmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// Fetch backup tokens from GitHub
async function fetchBackupTokens(): Promise<string[]> {
  try {
    const res = await fetch(TOKEN_JSON_URL, {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    });
    const data = await res.json();
    return data.tokens.map((t: any) => t.access_token);
  } catch (error) {
    console.error('Failed to fetch backup tokens:', error);
    return [];
  }
}

// Generate new Spotify token via Client Credentials
async function generateNewToken(): Promise<string> {
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': BROWSER_USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to generate Spotify token');

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000) - 300000,
  };

  return data.access_token;
}

// Get valid Spotify token
async function getValidToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  if (cachedTokens.length === 0) {
    cachedTokens = await fetchBackupTokens();
  }

  for (let i = 0; i < cachedTokens.length; i++) {
    const token = cachedTokens[currentTokenIndex];
    currentTokenIndex = (currentTokenIndex + 1) % cachedTokens.length;

    const testRes = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': BROWSER_USER_AGENT,
      },
    });

    if (testRes.ok) return token;
  }

  return await generateNewToken();
}

// Main API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Bot token not configured on server' });
  }

  try {
    const { initData } = req.body;
    if (!initData) {
      return res.status(400).json({ error: 'Missing initData' });
    }

    console.log('Server-side initData:', initData);

    const decodedInitData = decodeURIComponent(initData);
    const params = new URLSearchParams(decodedInitData);
    const receivedHash = params.get('hash');
    if (!receivedHash) return res.status(400).json({ error: 'Invalid initData format or hash missing' });

    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = createHmacSha256(secretKey, dataCheckString).toString('hex');

    if (!crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(receivedHash, 'hex'))) {
      return res.status(401).json({ error: 'Data verification failed.', reason: 'Hash mismatch' });
    }

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (isNaN(authDate) || authDate <= 0) return res.status(400).json({ error: 'Invalid auth_date' });

    const currentTime = Math.floor(Date.now() / 1000);
    const timeLimit = 60 * 60;
    const tolerance = 5 * 60;
    if (currentTime - authDate > timeLimit + tolerance) return res.status(401).json({ error: 'Auth date is too old' });

    const allData = Object.fromEntries(params.entries());
    const user = JSON.parse(allData.user || '{}');
    if (!user || !user.id) return res.status(400).json({ error: 'User data missing or incomplete' });

    // Get Spotify token automatically
    const spotifyToken = await getValidToken();

    const validatedData = {
      message: 'Data is valid and originated from Telegram.',
      allData,
      spotifyToken, // Return token for frontend/API usage
    };

    return res.status(200).json(validatedData);
  } catch (error) {
    console.error('Error validating data:', error);
    return res.status(500).json({
      error: 'Internal server error',
      type: 'server_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
