import { NextApiRequest, NextApiResponse } from 'next';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));

function base64urlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer);
}

function constructDataCheckString(allData: Record<string, any>): string {
  const filteredEntries = Object.entries(allData)
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  return `${process.env.BOT_ID}:WebAppData\n${filteredEntries}`;
}

const SPOTIFY_CLIENT_ID = '95f4f5c6df5744698035a0948e801ad9';
const SPOTIFY_CLIENT_SECRET = '4b03167b38c943c3857333b3f5ea95ea';
const TOKEN_JSON_URL = 'https://raw.githubusercontent.com/itzzzme/spotify-key/refs/heads/main/token.json';

// Token management
let cachedTokens: string[] = [];
let currentTokenIndex = 0;
let tokenCache: { token: string; expiresAt: number } | null = null;

// Fetch backup tokens
async function fetchBackupTokens(): Promise<string[]> {
  try {
    const res = await fetch(TOKEN_JSON_URL);
    const data = await res.json();
    return data.tokens.map((t: any) => t.access_token);
  } catch (error) {
    console.error('Failed to fetch backup tokens:', error);
    return [];
  }
}

// Generate app-only token (Client Credentials)
async function generateAppToken(): Promise<string> {
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();

  if (!data.access_token) throw new Error('Failed to generate token');

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000) - 300000, // 5 min buffer
  };

  return data.access_token;
}

// Get a valid token (backup or new)
async function getValidToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  if (cachedTokens.length === 0) cachedTokens = await fetchBackupTokens();

  for (let i = 0; i < cachedTokens.length; i++) {
    const token = cachedTokens[currentTokenIndex];
    currentTokenIndex = (currentTokenIndex + 1) % cachedTokens.length;

    const testRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (testRes.ok) return token;
  }

  return await generateAppToken();
}

// Spotify API fetch wrapper
async function spotifyFetch(endpoint: string, token: string, isUserToken: boolean = true): Promise<any> {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401 && isUserToken) {
      throw new Error('User token expired, please refresh');
    }
    if (res.status === 404 && !isUserToken) {
      throw new Error(`App token cannot access endpoint: ${endpoint}`);
    }
    throw new Error(`Spotify API error: ${res.status}`);
  }

  return res.json();
}

// === DATA FETCH FUNCTIONS ===

// Only fetch /me endpoints if user token is provided
const getCurrentlyPlaying = async (token?: string) => {
  if (!token) return null;
  try {
    const data = await spotifyFetch('/me/player/currently-playing', token, true);
    return data.item || null;
  } catch {
    return null;
  }
};

const getRecentlyPlayed = async (token?: string, limit = 10) => {
  if (!token) return [];
  try {
    const data = await spotifyFetch(`/me/player/recently-played?limit=${limit}`, token, true);
    return data.items || [];
  } catch {
    return [];
  }
};

const getUserProfile = async (token?: string) => {
  if (!token) return null;
  try {
    const data = await spotifyFetch('/me', token, true);
    return data;
  } catch {
    return null;
  }
};

// Public endpoints (work with any token)
const getTopTracks = async (token: string, timeRange = 'medium_term', limit = 10) => {
  return spotifyFetch(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`, token, true);
};
const getTopArtists = async (token: string, timeRange = 'medium_term', limit = 10) => {
  return spotifyFetch(`/me/top/artists?time_range=${timeRange}&limit=${limit}`, token, true);
};

const getUserPlaylists = async (token?: string, limit = 20) => {
  if (!token) return [];
  return spotifyFetch(`/me/playlists?limit=${limit}`, token, true);
};

const getPlaylistDetails = async (token: string, playlistId: string) => {
  const playlist = await spotifyFetch(`/playlists/${playlistId}`, token, false);
  const tracks = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=50`, token, false);
  return { ...playlist, tracks: tracks.items || [] };
};

const getAlbumDetails = async (token: string, albumId: string) => spotifyFetch(`/albums/${albumId}`, token, false);
const getSavedAlbums = async (token?: string, limit = 20) => {
  if (!token) return [];
  return spotifyFetch(`/me/albums?limit=${limit}`, token, true);
};

// === TIME RANGE ===
const timeRangeMap: Record<string, string> = {
  overall: 'long_term',
  '7day': 'short_term',
  '1month': 'short_term',
  '3month': 'medium_term',
  '6month': 'medium_term',
  '12month': 'long_term',
};
const allowedPeriods = ['overall', '7day', '1month', '3month', '6month', '12month'];

// === HANDLER ===
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query_string, signature, access_token, period, type, playlistId, albumId } = req.body;

    const authDate = parseInt(query_string?.auth_date || '0', 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeLimit = 60 * 60;
    const tolerance = 5 * 60;

    if (isNaN(authDate) || authDate <= 0) return res.status(400).json({ error: 'Invalid auth_date' });
    if (currentTime - authDate > timeLimit + tolerance) return res.status(401).json({ error: 'Auth date too old' });

    // Verify signature (unchanged)
    const dataString = constructDataCheckString(query_string);
    const telegramPublicKeyHex = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
    const telegramPublicKey = Uint8Array.from(Buffer.from(telegramPublicKeyHex, 'hex'));
    const dataCheckStringBuffer = Buffer.from(dataString, 'utf-8');
    const signatureBuffer = base64urlToBuffer(signature);
    const isSignatureValid = await ed.verify(signatureBuffer, dataCheckStringBuffer, telegramPublicKey);

    if (!isSignatureValid) return res.status(401).json({ error: 'Signature verification failed.' });

    // Decide token type
    let token = access_token;
    const isUserToken = !!access_token;

    if (!token) token = await getValidToken(); // app-only token

    // Fetch data depending on user vs app token
    if (!type && !playlistId && !albumId) {
      if (isUserToken) {
        const [userProfile, currentTrack, recentTracks] = await Promise.all([
          getUserProfile(token),
          getCurrentlyPlaying(token),
          getRecentlyPlayed(token),
        ]);
        return res.status(200).json({ userProfile, currentTrack, recentTracks });
      } else {
        return res.status(200).json({ message: 'App token cannot fetch /me endpoints' });
      }
    }

    if (playlistId) {
      const playlist = await getPlaylistDetails(token, playlistId);
      return res.status(200).json({ playlist });
    }

    if (albumId) {
      const album = await getAlbumDetails(token, albumId);
      return res.status(200).json({ album });
    }

    return res.status(400).json({ error: 'Invalid request parameters' });
  } catch (error) {
    console.error('Error fetching Spotify data:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
