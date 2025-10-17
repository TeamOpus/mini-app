import { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'crypto';

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
      .join('\n'); // ← FIXED: use '\n' for newline

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
      return res.status(401).json({ error: 'Data verification failed.', reason: 'Hash mismatch' });
    }

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (isNaN(authDate) || authDate <= 0) {
      return res.status(400).json({ error: 'Invalid auth_date', reason: 'auth_date is missing or invalid' });
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeLimit = 60 * 60; // 1 hour
    const tolerance = 5 * 60; // 5 minutes

    if (currentTime - authDate > timeLimit + tolerance) {
      return res.status(401).json({ error: 'Auth date is too old', reason: 'auth_date exceeded time limit' });
    }

    const allData = Object.fromEntries(params.entries());
    const user = JSON.parse(allData.user || '{}');

    if (!user || !user.id) {
      return res.status(400).json({ error: 'User data or user ID missing in the provided data', reason: 'user data missing or incomplete' });
    }

    const validatedData = {
      message: 'Data is valid and originated from Telegram.',
      allData,
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
