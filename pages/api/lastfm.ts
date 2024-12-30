import { NextApiRequest, NextApiResponse } from 'next';
import * as ed from '@noble/ed25519'; // Import Ed25519 library
import { sha512 } from '@noble/hashes/sha512'; // Import SHA-512 hash

// Set the SHA-512 hash function for synchronous methods
ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));

// Helper function to decode Base64url to Uint8Array
function base64urlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, '+') // Replace '-' with '+'
    .replace(/_/g, '/'); // Replace '_' with '/'
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer);
}

function constructDataCheckString(allData: Record<string, any>): string {
  // Filter, sort, and map to construct the filtered entries string
  const filteredEntries = Object.entries(allData)
    .filter(([key]) => key !== 'hash' && key !== 'signature') // Exclude specific keys
    .sort(([a], [b]) => a.localeCompare(b)) // Sort by key
    .map(([key, value]) => `${key}=${value}`) // Convert to `key=value` format
    .join('\n'); // Join with newline

  // Add the prefix and construct the final data-check string
  const dataCheckString = `${process.env.BOT_ID}:WebAppData\n${filteredEntries}`;
  return dataCheckString;
}

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

const getLastFMData = async (user: string) => {
  const response = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${user}&api_key=${LASTFM_API_KEY}&format=json&limit=10`
  );
  const data = await response.json();
  if (data.error === 6) {
    throw new Error('Invalid username');
  }

  if (!data.recenttracks || !data.recenttracks.track) {
    throw new Error('Failed to fetch track data');
  }

  const tracks = data.recenttracks.track;
  const currentTrack = tracks[0] || null;
  const recentTracks = tracks.slice(1);

  return { currentTrack, recentTracks };
};

const getUserInfo = async (user: string) => {
  const response = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${user}&api_key=${LASTFM_API_KEY}&format=json`
  );
  const data = await response.json();
  if (data.error === 6) {
    throw new Error('Invalid username');
  }

  if (!data.user) {
    throw new Error('Failed to fetch user info');
  }

  return data.user;
};

const getTopTracks = async (user: string, period: string) => {
  const response = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${user}&api_key=${LASTFM_API_KEY}&format=json&period=${period}&limit=10`
  );
  const data = await response.json();
  if (data.error === 6) {
    throw new Error('Invalid username');
  }

  if (!data.toptracks || !data.toptracks.track) {
    throw new Error('Failed to fetch top tracks');
  }

  return data.toptracks.track;
};

const getTopArtists = async (user: string, period: string) => {
  const response = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${user}&api_key=${LASTFM_API_KEY}&format=json&period=${period}&limit=10`
  );
  const data = await response.json();
  if (data.error === 6) {
    throw new Error('Invalid username');
  }

  if (!data.topartists || !data.topartists.artist) {
    throw new Error('Failed to fetch top artists');
  }

  return data.topartists.artist;
};

const getTopAlbums = async (user: string, period: string) => {
  const response = await fetch(
    `https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${user}&api_key=${LASTFM_API_KEY}&format=json&period=${period}&limit=10`
  );
  const data = await response.json();
  if (data.error === 6) {
    throw new Error('Invalid username');
  }

  if (!data.topalbums || !data.topalbums.album) {
    throw new Error('Failed to fetch top albums');
  }

  return data.topalbums.album;
};

// Define allowed periods
const allowedPeriods = ['overall', '7day', '1month', '3month', '6month', '12month'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query_string, signature, username, period, type } = req.body; // Added 'type' parameter

    if (!query_string || !signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const authDate = parseInt(query_string.auth_date || '0', 10);
    if (isNaN(authDate) || authDate <= 0) {
      return res.status(400).json({ error: 'Invalid auth_date' });
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeLimit = 60 * 60;  // Allow a 1-hour window
    const tolerance = 5 * 60;   // Additional 5 minutes tolerance

    if (currentTime - authDate > timeLimit + tolerance) {
      return res.status(401).json({ error: 'Auth date is too old' });
    }

    const dataString = constructDataCheckString(query_string);
    // Validate the signature using Ed25519 public key
    const telegramPublicKeyHex = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d'; // Production public key in hex format
    const telegramPublicKey = Uint8Array.from(Buffer.from(telegramPublicKeyHex, 'hex'));
    const dataCheckStringBuffer = Buffer.from(dataString, 'utf-8');
    const signatureBuffer = base64urlToBuffer(signature);  // Convert signature from base64url to Uint8Array

    // Use @noble/ed25519 to verify the signature
    const isSignatureValid = await ed.verify(signatureBuffer, dataCheckStringBuffer, telegramPublicKey);
    
    if (!isSignatureValid) {
      return res.status(401).json({ error: 'Signature verification failed.' });
    }

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Default behavior if no type or period is provided
    if (!type && !period) {
      const userInfo = await getUserInfo(username);
      const { currentTrack, recentTracks } = await getLastFMData(username);

      return res.status(200).json({
        currentTrack,
        recentTracks,
        userInfo,
      });
    }

    if (type !== 'topTracks' && type !== 'topArtists' && type !== 'topAlbums') {
      return res.status(400).json({ error: 'Type must be one of "topTracks", "topArtists", or "topAlbums"' });
    }

    if (!period || !allowedPeriods.includes(period)) {
      return res.status(400).json({ error: `Period must be one of ${allowedPeriods.join(', ')}` });
    }

    if (type === 'topTracks') {
      const topTracks = await getTopTracks(username, period);
      return res.status(200).json({ topTracks });
    } else if (type === 'topArtists') {
      const topArtists = await getTopArtists(username, period);
      return res.status(200).json({ topArtists });
    } else if (type === 'topAlbums') {
      const topAlbums = await getTopAlbums(username, period);
      return res.status(200).json({ topAlbums });
    }

  } catch (error) {
    if ((error as Error).message === 'Invalid username') {
      return res.status(404).json({ error: 'Invalid Last.fm username' });
    }

    console.error('Error fetching Last.fm data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}