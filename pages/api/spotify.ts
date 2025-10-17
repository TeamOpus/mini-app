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

// === Spotify credentials ===
const SPOTIFY_CLIENT_ID = "95f4f5c6df5744698035a0948e801ad9";
const SPOTIFY_CLIENT_SECRET = "4b03167b38c943c3857333b3f5ea95ea";
const TOKEN_JSON_URL = 'https://raw.githubusercontent.com/itzzzme/spotify-key/refs/heads/main/token.json';

// Use a real browser User-Agent
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36";

// Token management
let cachedTokens: string[] = [];
let currentTokenIndex = 0;
let tokenCache: { token: string; expiresAt: number } | null = null;

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

// Generate new token using Client Credentials
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

  if (!data.access_token) {
    throw new Error('Failed to generate token');
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000) - 300000, // 5 min buffer
  };

  return data.access_token;
}

// Get valid Spotify token with fallback logic
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

    if (testRes.ok) {
      return token;
    }
  }

  return await generateNewToken();
}

// Spotify API fetch wrapper
async function spotifyFetch(endpoint: string, token?: string): Promise<any> {
  const accessToken = token || await getValidToken();

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': BROWSER_USER_AGENT,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      const newToken = await generateNewToken();
      return spotifyFetch(endpoint, newToken);
    }
    throw new Error(`Spotify API error: ${res.status}`);
  }

  return res.json();
}

// Spotify helper functions
const getCurrentlyPlaying = async (token: string) => {
  try {
    const data = await spotifyFetch('/me/player/currently-playing', token);
    return data.item || null;
  } catch (error) {
    return null;
  }
};

const getRecentlyPlayed = async (token: string, limit: number = 10) => {
  const data = await spotifyFetch(`/me/player/recently-played?limit=${limit}`, token);
  return data.items || [];
};

const getUserProfile = async (token: string) => {
  const data = await spotifyFetch('/me', token);
  return data;
};

const getTopTracks = async (token: string, timeRange: string = 'medium_term', limit: number = 10) => {
  const data = await spotifyFetch(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`, token);
  return data.items || [];
};

const getTopArtists = async (token: string, timeRange: string = 'medium_term', limit: number = 10) => {
  const data = await spotifyFetch(`/me/top/artists?time_range=${timeRange}&limit=${limit}`, token);
  return data.items || [];
};

const getUserPlaylists = async (token: string, limit: number = 20) => {
  const data = await spotifyFetch(`/me/playlists?limit=${limit}`, token);
  return data.items || [];
};

const getPlaylistDetails = async (token: string, playlistId: string) => {
  const playlist = await spotifyFetch(`/playlists/${playlistId}`, token);
  const tracks = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=50`, token);
  return { ...playlist, tracks: tracks.items || [] };
};

const getAlbumDetails = async (token: string, albumId: string) => {
  const album = await spotifyFetch(`/albums/${albumId}`, token);
  return album;
};

const getSavedAlbums = async (token: string, limit: number = 20) => {
  const data = await spotifyFetch(`/me/albums?limit=${limit}`, token);
  return data.items || [];
};

// Time range mapping
const timeRangeMap: Record<string, string> = {
  overall: 'long_term',
  '7day': 'short_term',
  '1month': 'short_term',
  '3month': 'medium_term',
  '6month': 'medium_term',
  '12month': 'long_term',
};

const allowedPeriods = ['overall', '7day', '1month', '3month', '6month', '12month'];

// API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query_string, signature, access_token, period, type, playlistId, albumId } = req.body;

    if (!query_string || !signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const authDate = parseInt(query_string.auth_date || '0', 10);
    if (isNaN(authDate) || authDate <= 0) {
      return res.status(400).json({ error: 'Invalid auth_date' });
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeLimit = 60 * 60;
    const tolerance = 5 * 60;

    if (currentTime - authDate > timeLimit + tolerance) {
      return res.status(401).json({ error: 'Auth date is too old' });
    }

    const dataString = constructDataCheckString(query_string);
    const telegramPublicKeyHex = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
    const telegramPublicKey = Uint8Array.from(Buffer.from(telegramPublicKeyHex, 'hex'));
    const dataCheckStringBuffer = Buffer.from(dataString, 'utf-8');
    const signatureBuffer = base64urlToBuffer(signature);

    const isSignatureValid = await ed.verify(signatureBuffer, dataCheckStringBuffer, telegramPublicKey);

    if (!isSignatureValid) {
      return res.status(401).json({ error: 'Signature verification failed.' });
    }

    const token = access_token || await getValidToken();

    if (!type && !playlistId && !albumId) {
      const [userProfile, currentTrack, recentTracks] = await Promise.all([
        getUserProfile(token),
        getCurrentlyPlaying(token),
        getRecentlyPlayed(token),
      ]);

      return res.status(200).json({ currentTrack, recentTracks, userProfile });
    }

    if (playlistId) {
      const playlistDetails = await getPlaylistDetails(token, playlistId);
      return res.status(200).json({ playlist: playlistDetails });
    }

    if (albumId) {
      const albumDetails = await getAlbumDetails(token, albumId);
      return res.status(200).json({ album: albumDetails });
    }

    if (type) {
      if (!['topTracks', 'topArtists', 'playlists', 'albums'].includes(type)) {
        return res.status(400).json({ error: 'Type must be one of "topTracks", "topArtists", "playlists", or "albums"' });
      }

      if (type === 'playlists') {
        const playlists = await getUserPlaylists(token);
        return res.status(200).json({ playlists });
      }

      if (type === 'albums') {
        const albums = await getSavedAlbums(token);
        return res.status(200).json({ albums });
      }

      if (period && !allowedPeriods.includes(period)) {
        return res.status(400).json({ error: `Period must be one of ${allowedPeriods.join(', ')}` });
      }

      const timeRange = timeRangeMap[period || '3month'];

      if (type === 'topTracks') {
        const topTracks = await getTopTracks(token, timeRange);
        return res.status(200).json({ topTracks });
      } else if (type === 'topArtists') {
        const topArtists = await getTopArtists(token, timeRange);
        return res.status(200).json({ topArtists });
      }
    }

    return res.status(400).json({ error: 'Invalid request parameters' });

  } catch (error) {
    console.error('Error fetching Spotify data:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
