import { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'crypto';
import clientPromise from "@/lib/mongo";

function createHmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

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
    if (!receivedHash) {
      return res.status(400).json({ error: 'Invalid initData format or hash missing' });
    }

    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    console.log('Constructed data-check-string:', dataCheckString);

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = createHmacSha256(secretKey, dataCheckString).toString('hex');

    console.log('Computed hash:', computedHash);
    console.log('Received hash:', receivedHash);

    const receivedHashBuffer = Buffer.from(receivedHash, 'hex');
    const computedHashBuffer = Buffer.from(computedHash, 'hex');
    if (
      computedHashBuffer.length !== receivedHashBuffer.length ||
      !crypto.timingSafeEqual(computedHashBuffer, receivedHashBuffer)
    ) {
      return res.status(401).json({ error: 'Data verification failed.' });
    }

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (isNaN(authDate) || authDate <= 0) {
      return res.status(400).json({ error: 'Invalid auth_date' });
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeLimit = 60 * 60; 
    const tolerance = 5 * 60; 

    if (currentTime - authDate > timeLimit + tolerance) {
      return res.status(401).json({ error: 'Auth date is too old' });
    }

    const allData = Object.fromEntries(params.entries());
    const user = JSON.parse(allData.user || '{}');

    if (!user || !user.id) {
      return res.status(400).json({ error: 'User data or user ID missing in the provided data' });
    }

    const userId = user.id; 
    console.log('Parsed User ID:', userId);

    const client = await clientPromise;
    const db = client.db(process.env.DATABASE_NAME);

    let userDoc = null;

    try {
      userDoc = await db.collection('LASTFM').findOne({ user_id: userId });
    } catch (err) {
      console.error('MongoDB query error:', err);
      return res.status(500).json({ error: 'Database query failed', type: 'database_error' });
    }

    if (!userDoc || !userDoc.lastfm_username) {
      return res.status(404).json({ 
        error: 'User not found or Last.fm username not set', 
        type: 'user_or_lastfm_username_not_found' 
      });
    }

    console.log('Fetched user from DB:', userDoc);

    const validatedData = {
      message: 'Data is valid and originated from Telegram.',
      user: userDoc,
      allData,
    };

    return res.status(200).json(validatedData);
  } catch (error) {
    console.error('Error validating data:', error);
    return res.status(500).json({ error: 'Internal server error', type: 'server_error' });
  }
}