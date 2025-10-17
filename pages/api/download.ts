import { NextApiRequest, NextApiResponse } from 'next';

const DOWNLOAD_API_BASE = 'https://universaldownloaderapi.vercel.app/api/spotify/download';

// Cache for download links (5 minutes TTL)
const downloadCache = new Map<string, { data: any; expiresAt: number }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, trackId } = req.query;

    if (!url && !trackId) {
      return res.status(400).json({ error: 'Missing url or trackId parameter' });
    }

    // Construct Spotify track URL
    const spotifyUrl = url || `https://open.spotify.com/track/${trackId}`;

    // Check cache
    const cached = downloadCache.get(spotifyUrl as string);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json(cached.data);
    }

    // Fetch from download API
    const downloadUrl = `${DOWNLOAD_API_BASE}?url=${encodeURIComponent(spotifyUrl as string)}`;
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`Download API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      return res.status(400).json({ error: 'Failed to fetch download link' });
    }

    // Cache the result
    downloadCache.set(spotifyUrl as string, {
      data,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    return res.status(200).json(data);

  } catch (error) {
    console.error('Error fetching download link:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
