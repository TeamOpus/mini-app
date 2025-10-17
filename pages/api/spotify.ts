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

// Your custom Spotify API endpoint
const SPOTIFY_API_BASE = 'https://spotix-itf344185-aditya20278s-projects.vercel.app';

// Simplified fetch wrapper for your API
async function spotifyApiFetch(endpoint: string): Promise<any> {
  const url = `${SPOTIFY_API_BASE}${endpoint}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Spotify API error: ${res.status}`);
  }

  return res.json();
}

// Get multiple tracks by IDs
const getTracks = async (ids: string[]) => {
  try {
    // Use your API: GET /v1/tracks?ids=id1,id2,id3
    const idsParam = ids.join(',');
    const data = await spotifyApiFetch(`/v1/tracks?ids=${idsParam}`);
    return data.tracks || [];
  } catch (error) {
    console.error('Error fetching tracks:', error);
    return [];
  }
};

// Get single track
const getTrack = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/tracks/${id}`);
    return data;
  } catch (error) {
    console.error('Error fetching track:', error);
    return null;
  }
};

// Get multiple artists
const getArtists = async (ids: string[]) => {
  try {
    const idsParam = ids.join(',');
    const data = await spotifyApiFetch(`/v1/artists?ids=${idsParam}`);
    return data.artists || [];
  } catch (error) {
    console.error('Error fetching artists:', error);
    return [];
  }
};

// Get single artist
const getArtist = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/artists/${id}`);
    return data;
  } catch (error) {
    console.error('Error fetching artist:', error);
    return null;
  }
};

// Get artist's top tracks
const getArtistTopTracks = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/artists/tracks/${id}`);
    return data.tracks || [];
  } catch (error) {
    console.error('Error fetching artist top tracks:', error);
    return [];
  }
};

// Get artist's albums
const getArtistAlbums = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/artists/albums/${id}`);
    return data.items || [];
  } catch (error) {
    console.error('Error fetching artist albums:', error);
    return [];
  }
};

// Get related artists
const getRelatedArtists = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/artists/relatedartists/${id}`);
    return data.artists || [];
  } catch (error) {
    console.error('Error fetching related artists:', error);
    return [];
  }
};

// Get multiple albums
const getAlbums = async (ids: string[]) => {
  try {
    const idsParam = ids.join(',');
    const data = await spotifyApiFetch(`/v1/albums?ids=${idsParam}`);
    return data.albums || [];
  } catch (error) {
    console.error('Error fetching albums:', error);
    return [];
  }
};

// Get single album
const getAlbum = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/albums/${id}`);
    return data;
  } catch (error) {
    console.error('Error fetching album:', error);
    return null;
  }
};

// Get album tracks
const getAlbumTracks = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/albums/tracks/${id}`);
    return data.items || [];
  } catch (error) {
    console.error('Error fetching album tracks:', error);
    return [];
  }
};

// Get playlist
const getPlaylist = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/playlists/${id}`);
    return data;
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return null;
  }
};

// Get playlist items
const getPlaylistItems = async (id: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/playlists/item/${id}`);
    return data.items || [];
  } catch (error) {
    console.error('Error fetching playlist items:', error);
    return [];
  }
};

// Get user's playlists
const getUserPlaylists = async (username: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/playlists/user/${username}`);
    return data.items || [];
  } catch (error) {
    console.error('Error fetching user playlists:', error);
    return [];
  }
};

// Get featured playlists
const getFeaturedPlaylists = async () => {
  try {
    const data = await spotifyApiFetch(`/v1/playlists/featured`);
    return data.playlists?.items || [];
  } catch (error) {
    console.error('Error fetching featured playlists:', error);
    return [];
  }
};

// Get recommendations
const getRecommendations = async (params: string) => {
  try {
    const data = await spotifyApiFetch(`/v1/recommendations?${params}`);
    return data;
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return { tracks: [] };
  }
};

// Get genres
const getGenres = async () => {
  try {
    const data = await spotifyApiFetch(`/v1/get-genre`);
    return data.genres || [];
  } catch (error) {
    console.error('Error fetching genres:', error);
    return [];
  }
};

// Get markets
const getMarkets = async () => {
  try {
    const data = await spotifyApiFetch(`/v1/market`);
    return data.markets || [];
  } catch (error) {
    console.error('Error fetching markets:', error);
    return [];
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query_string, signature, type, id, ids, username, params } = req.body;

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

    // Route based on type
    switch (type) {
      case 'track':
        if (!id) return res.status(400).json({ error: 'Track ID required' });
        const track = await getTrack(id);
        return res.status(200).json({ track });

      case 'tracks':
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Track IDs array required' });
        const tracks = await getTracks(ids);
        return res.status(200).json({ tracks });

      case 'artist':
        if (!id) return res.status(400).json({ error: 'Artist ID required' });
        const artist = await getArtist(id);
        return res.status(200).json({ artist });

      case 'artists':
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Artist IDs array required' });
        const artists = await getArtists(ids);
        return res.status(200).json({ artists });

      case 'artistTopTracks':
        if (!id) return res.status(400).json({ error: 'Artist ID required' });
        const artistTopTracks = await getArtistTopTracks(id);
        return res.status(200).json({ tracks: artistTopTracks });

      case 'artistAlbums':
        if (!id) return res.status(400).json({ error: 'Artist ID required' });
        const artistAlbums = await getArtistAlbums(id);
        return res.status(200).json({ albums: artistAlbums });

      case 'relatedArtists':
        if (!id) return res.status(400).json({ error: 'Artist ID required' });
        const relatedArtists = await getRelatedArtists(id);
        return res.status(200).json({ artists: relatedArtists });

      case 'album':
        if (!id) return res.status(400).json({ error: 'Album ID required' });
        const album = await getAlbum(id);
        return res.status(200).json({ album });

      case 'albums':
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Album IDs array required' });
        const albums = await getAlbums(ids);
        return res.status(200).json({ albums });

      case 'albumTracks':
        if (!id) return res.status(400).json({ error: 'Album ID required' });
        const albumTracks = await getAlbumTracks(id);
        return res.status(200).json({ tracks: albumTracks });

      case 'playlist':
        if (!id) return res.status(400).json({ error: 'Playlist ID required' });
        const playlist = await getPlaylist(id);
        return res.status(200).json({ playlist });

      case 'playlistItems':
        if (!id) return res.status(400).json({ error: 'Playlist ID required' });
        const playlistItems = await getPlaylistItems(id);
        return res.status(200).json({ items: playlistItems });

      case 'userPlaylists':
        if (!username) return res.status(400).json({ error: 'Username required' });
        const userPlaylists = await getUserPlaylists(username);
        return res.status(200).json({ playlists: userPlaylists });

      case 'featuredPlaylists':
        const featuredPlaylists = await getFeaturedPlaylists();
        return res.status(200).json({ playlists: featuredPlaylists });

      case 'recommendations':
        const recommendations = await getRecommendations(params || '');
        return res.status(200).json(recommendations);

      case 'genres':
        const genres = await getGenres();
        return res.status(200).json({ genres });

      case 'markets':
        const markets = await getMarkets();
        return res.status(200).json({ markets });

      default:
        return res.status(400).json({ error: 'Invalid type parameter' });
    }

  } catch (error) {
    console.error('Error fetching Spotify data:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
