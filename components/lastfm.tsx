'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Home, Music, Mic, User, AudioLines, DiscAlbum, Disc3 } from 'lucide-react'
import Script from 'next/script';
import { motion } from "framer-motion"
import Image from "next/image"
import { UserInfoSkeleton, TrackSkeleton, TopItemSkeleton, BottomNavSkeleton } from "@/components/Skeletons"

interface Track {
  name: string
  artist: {
    name: string
  }
  playcount: number
}

interface Artist {
  name: string
  playcount: number
}

interface Album {
  name: string;
  artist: {
    name: string;
  };
  playcount: number;
}

interface Attr {
  nowplaying: string; // Can be "true" or "false"
}

interface myTrack {
  name: string;
  artist: {
      mbid?: string;  // optional because it can be empty
      '#text': string;
  };
  streamable: string; // Assuming it's a string based on your data (0 or 1)
  image: {
      size: string;
      '#text': string;
  }[];
  mbid?: string; // optional because it can be empty
  album: {
      mbid?: string; // optional because it can be empty
      '#text': string;
  };
  url: string; // URL of the track
  date?: {
      '#text': string;
      uts: string;
  };
  '@attr'?: Attr; // Optional attribute
}

interface UserInfo {
  id: string; // User ID, represented as a string
  name: string; // Username
  realname: string; // Real name of the user
  url: string; // Profile URL
  image: string, // URL to the user's image
  country: string; // Country of the user
  age: number; // Age of the user
  gender: string // Gender (male, female, or empty string if unspecified)
  subscriber: boolean; // Whether the user is a subscriber
  playcount: number; // Total play count
  playlists: number; // Number of playlists created
  bootstrap: boolean; // Indicates if the user is in bootstrap mode
  registered: {
    unixtime: number; // Unix timestamp of registration
    date: string; // Human-readable registration date
  };
}

type User = {
  _id: number;
  lastfm_username?: string;
}

type Period = '7day' | '1month' | '3month' | '6month' | '12month' | 'overall'

const periodLabels: Record<Period, string> = {
  '7day': '7 Days',
  '1month': '1 Month',
  '3month': '3 Months',
  '6month': '6 Months',
  '12month': '1 Year',
  'overall': 'All Time'
}

type CachedData = {
  [key in Period]: {
    tracks: Track[];
    artists: Artist[];
    albums: Album[];
    lastFetched: number;
  };
};

function formatTimeAgo(timestamp: number) {
  const now = new Date();
  const then = new Date(timestamp * 1000);
  const delta = now.getTime() - then.getTime();

  const seconds = Math.floor(delta / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} days ago`;
  } else if (hours > 0) {
    return `${hours} hours ago`;
  } else if (minutes > 0) {
    return `${minutes} minutes ago`;
  } else {
    return "Just now";
  }
}

export function LastFMPage() {
  const [topTracks, setTopTracks] = useState<Track[]>([])
  const [topArtists, setTopArtists] = useState<Artist[]>([])
  const [topAlbums, setTopAlbums] = useState<Album[]>([])
  const [currentTrack, setCurrentTrack] = useState<myTrack | null>(null)
  const [recentTracks, setRecentTracks] = useState<myTrack[]>([])
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [period, setPeriod] = useState<Period>('7day')
  const [user, setUser] = useState<User | null>(null);
  const [tguser, setTGUser] = useState<any>(null);
  const [userNotFound, setUserNotFound] = useState(false);
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<'recent' | 'tracks' | 'artists' | 'albums'>('recent');
  const [testdata, settestdata] = useState<any>(null);
  const [cachedData, setCachedData] = useState<CachedData>({} as CachedData);
  const [isLoading, setIsLoading] = useState<{
    tracks: boolean;
    artists: boolean;
    albums: boolean;
  }>({
    tracks: false,
    artists: false,
    albums: false,
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram && (window as any).Telegram.WebApp) {
      const telegram = (window as any).Telegram.WebApp;
      telegram.ready();

      const initData = telegram.initData;

      const validateTelegramData = async () => {
        try {
          const response = await fetch('/api/validlastfm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ initData }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to validate Telegram data');
          }

          const result = await response.json();

          if (result.allData) {
            const userData = JSON.parse(result.allData.user); 
            setTGUser(userData);
            settestdata(result.allData);
          }
          if (result.user) {
            setUser(result.user);
          }
        } catch (error) {
          if (error instanceof Error) {
            setError(error.message); // Set error message
            if (error.message === 'User not found or Last.fm username not set') {
              showAlert(error.message);
            } else {
              showAlert('Failed to validate Telegram data. Please try again later.');
            }
          } else {
            setError('An unknown error occurred'); // Set error message
            showAlert('An unknown error occurred. Please try again later.');
          }
          setUserNotFound(true);
        } finally {
          setLoading(false);
        }
      };

      validateTelegramData();
    }
  }, []);

  useEffect(() => {
    if (user?.lastfm_username) {
      if (activeTab === 'recent') {
        fetchData();
        const newIntervalId = setInterval(fetchData, 30000);
        setIntervalId(newIntervalId);

        return () => {
          if (newIntervalId) {
            clearInterval(newIntervalId);
          }
        };
      } else {
        if (intervalId) {
          clearInterval(intervalId);
          setIntervalId(null);
        }

        fetchTopData(activeTab as 'tracks' | 'artists' | 'albums');
      }
    }
  }, [user, activeTab, period]);

  const shouldFetchData = useCallback((dataType: 'tracks' | 'artists' | 'albums') => {
    const cachedPeriodData = cachedData[period];
    if (!cachedPeriodData || !cachedPeriodData[dataType] || cachedPeriodData[dataType].length === 0) {
      return true;
    }
    const currentTime = Date.now();
    const timeSinceLastFetch = currentTime - cachedPeriodData.lastFetched;
    return timeSinceLastFetch > 5 * 60 * 1000; // Refetch if more than 5 minutes have passed
  }, [cachedData, period]);

  const fetchTopData = useCallback(async (dataType: 'tracks' | 'artists' | 'albums') => {
    if (!user?.lastfm_username || !shouldFetchData(dataType)) return;

    setIsLoading(prev => ({ ...prev, [dataType]: true }));

    try {
      const response = await fetch('/api/lastfm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_string: testdata,
          signature: testdata.signature,
          username: user.lastfm_username,
          period: period,
          type: `top${dataType.charAt(0).toUpperCase() + dataType.slice(1)}`,
        }),
      });

      if (!response.ok) throw new Error(`Failed to fetch top ${dataType}`);
      const data = await response.json();

      setCachedData(prev => ({
        ...prev,
        [period]: {
          ...prev[period],
          [dataType]: data[`top${dataType.charAt(0).toUpperCase() + dataType.slice(1)}`],
          lastFetched: Date.now(),
        },
      }));

      if (dataType === 'tracks') setTopTracks(data.topTracks);
      else if (dataType === 'artists') setTopArtists(data.topArtists);
      else if (dataType === 'albums') setTopAlbums(data.topAlbums);

    } catch (err) {
      setError(`Error fetching ${dataType}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(prev => ({ ...prev, [dataType]: false }));
    }
  }, [user, period, testdata, shouldFetchData]);

  const showAlert = (message: string) => {
    const telegram = (window as any).Telegram.WebApp;
    telegram.HapticFeedback.impactOccurred('heavy').notificationOccurred('success');
    telegram.showAlert(message);
  };

  const handleClose = () => {
    const telegram = (window as any).Telegram.WebApp;
    telegram.close()
  }

  const openTelegramLink = (url: string) => {
    const telegram = (window as any).Telegram.WebApp;
    telegram.openTelegramLink(url);
  };

  const fetchData = async () => {
    if (!user?.lastfm_username) {
      setError('Last.fm username not available.');
      return;
    }

    if (retryAttempts >= 3) {
      setError('Failed to fetch data after several attempts.');
      return;
    }

    try {
      const response = await fetch('/api/lastfm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query_string: testdata, signature: testdata.signature, username: user.lastfm_username }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data from Last.fm');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.message || 'Unknown error occurred');
      }

      setCurrentTrack(data.currentTrack);
      setRecentTracks(data.recentTracks);
      setUserInfo(data.userInfo);
      setError(null);
      setRetryAttempts(0);
    } catch (err) {
      setError(`Failed to fetch Last.fm data: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setRetryAttempts(prev => prev + 1);
    }
  }


  // const containerClass = `w-full max-w-3xl bg-white text-black`

  const renderTopContent = useCallback((dataType: 'tracks' | 'artists' | 'albums') => {
    const data = cachedData[period]?.[dataType] || [];
    const isDataLoading = isLoading[dataType];

    return (
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-4">Top {dataType.charAt(0).toUpperCase() + dataType.slice(1)} - {periodLabels[period]}</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(periodLabels) as Period[]).map((key) => (
            <Button
              key={key}
              variant={period === key ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(key)}
              className={`flex-grow sm:flex-grow-0 transition-colors duration-150
                ${
                period === key
                  ? 'bg-black text-white hover:bg-gray-800' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } border-none
                `}
            >
              {periodLabels[key]}
            </Button>
          ))}
        </div>
        {isDataLoading ? (
          <div className="space-y-4">
            {Array(10).fill(0).map((_, i) => (
              <TopItemSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((item: Track | Artist | Album, index: number) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-gray-50">
                <div className="text-2xl font-bold text-gray-300 w-8">{index + 1}</div>
                <div className="flex-grow">
                  <p className="font-bold">{item.name}</p>
                  {'artist' in item && <p className="text-sm text-gray-500">{item.artist.name}</p>}
                </div>
                <div className="text-sm text-gray-500">{item.playcount} plays</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [period, cachedData, isLoading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center">
        <Image
          src="/hello.gif"
          alt="Loading..."
          width={240}
          height={240}
          priority={true}
          quality={100}
        />
        <p className="text-lg text-muted-foreground">Validating you...</p>
      </div>
    );
  }

  if (userNotFound) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <div className="text-center p-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Image
              src="/unauthorized.gif"
              alt="Unauthorized"
              width={240}
              height={240}
              className="mx-auto"
              priority={true}
              quality={100}
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-8 text-center text-lg text-muted-foreground"
          >
            {error === 'User not found or Last.fm username not set' ? (
              <>
                <p>Your Last.fm username is not set.</p>
                <p>Use <code>/setusername your_lastfm_username</code> in the bot.</p>
              </>
            ) : (
              <>
                <p>An error occurred while loading your data.</p>
                <p>Please try again later or contact support.</p>
              </>
            )}
            <Button
              onClick={() => openTelegramLink('https://t.me/eyamikabot?start=lastfm')}
              className="mt-4 bg-blue-500 hover:bg-blue-700 text-white"
              variant="default"
            >
              Contact @eyamikabot on Telegram
            </Button>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <Card className="w-full min-h-screen bg-white text-black pb-16">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <CardHeader className="border-b border-gray-200 p-4">
        <CardTitle className="flex items-start justify-between">
          {!userInfo || !tguser ? (
            <UserInfoSkeleton />
          ) : (
            <>
              <div className="flex flex-col">
                <h2 className="text-2xl font-bold">{tguser?.first_name || userInfo?.name}</h2>
                <p className="text-sm text-gray-500">
                  {userInfo?.playcount} scrobbles • {user?.lastfm_username || userInfo?.country}
                </p>
                {userInfo?.registered && (
                  <p className="text-xs text-gray-400">
                    Since: {new Date(userInfo.registered.unixtime * 1000).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Avatar className="w-16 h-16 ml-4">
                {tguser?.photo_url ? (
                  <img
                    src={tguser.photo_url}
                    alt="Profile Picture"
                  />
                ) : (
                  <>
                    <AvatarImage src="https://i.pravatar.cc/300" alt={userInfo?.name} />
                    <AvatarFallback><User className="w-8 h-8" /></AvatarFallback>
                  </>
                )}
              </Avatar>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 max-w-3xl mx-auto">
        <div className="p-6">
          {activeTab === 'recent' && (
            <>
              <h3 className="text-xl font-bold mb-4">Now Playing</h3>
              {currentTrack ? (
                <div className="mb-6 flex items-center gap-4 p-3 bg-gray-100 border-gray-300 border rounded-md shadow-md">
                  {currentTrack.image[2]?.['#text'] && !currentTrack.image[2]['#text'].endsWith('2a96cbd8b46e442fc41c2b86b821562f.png') ? (
                    <img
                      src={currentTrack.image[2]['#text']}
                      alt={currentTrack.name || 'Track Image'}
                      className="w-16 h-16 rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 flex items-center justify-center bg-gray-200 rounded-lg">
                      <Disc3 size={48} className="text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-semibold text-gray-800">{currentTrack.name || ''}</p>
                    <p className="text-lg font-semibold text-gray-800">{currentTrack.artist['#text'] || ''}</p>
                    <p className="text-sm font-medium flex items-center">
                      {currentTrack['@attr']?.nowplaying === "true" ? (
                        <>
                          <AudioLines className="animate-pulse mr-2" size={18} />
                          <span>Now Vibing</span>
                        </>
                      ) : (
                        <>
                          Was Vibing
                          {currentTrack.date?.uts && (
                            <span className="text-gray-500 ml-2">{formatTimeAgo(Number(currentTrack.date.uts))}</span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <TrackSkeleton />
              )}
              <h3 className="text-xl font-bold mb-4">Recently Played</h3>
              <div className="space-y-4">
                {recentTracks.length > 0 ? (
                  recentTracks.map((track, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 bg-gray-50">
                      <div className="w-16 h-16 bg-gray-200 flex-shrink-0">
                        {track.image[2]['#text'] && !track.image[2]['#text'].endsWith('2a96cbd8b46e442fc41c2b86b821562f.png') ? (
                          <img 
                            src={track.image[2]['#text']} 
                            alt={`${track.name} cover`} 
                            className="w-full h-full object-cover rounded-md" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Disc3 size={48} className="text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-grow">
                        <p className="font-bold">{track.name}</p>
                        <p className="text-sm text-gray-500">{track.artist['#text']}</p>
                        <p className="text-sm text-gray-500">{track.album['#text']}</p>
                      </div>
                      {track.date?.uts && (
                        <div className="text-sm text-gray-500 w-32 text-right">
                          {formatTimeAgo(Number(track.date.uts))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  Array(10).fill(0).map((_, i) => (
                    <TrackSkeleton key={i} />
                  ))
                )}
              </div>
            </>
          )}
          {activeTab === 'tracks' && renderTopContent('tracks')}
          {activeTab === 'artists' && renderTopContent('artists')}
          {activeTab === 'albums' && renderTopContent('albums')}
        </div>
        {loading ? (
          <BottomNavSkeleton />
        ) : (
          <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex justify-around items-center max-w-full">
            <button
              onClick={() => setActiveTab('recent')}
              className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'recent' ? 'text-black' : 'text-gray-500'}`}
            >
              <Home className="w-6 h-6 mb-1" />
              <span className="text-xs">Home</span>
            </button>
            <button
              onClick={() => setActiveTab('tracks')}
              className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'tracks' ? 'text-black' : 'text-gray-500'}`}
            >
              <Music className="w-6 h-6 mb-1" />
              <span className="text-xs">Tracks</span>
            </button>
            <button
              onClick={() => setActiveTab('artists')}
              className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'artists' ? 'text-black' : 'text-gray-500'}`}
            >
              <Mic className="w-6 h-6 mb-1" />
              <span className="text-xs">Artists</span>
            </button>
            <button
              onClick={() => setActiveTab('albums')}
              className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'albums' ? 'text-black' : 'text-gray-500'}`}
            >
              <DiscAlbum className="w-6 h-6 mb-1" />
              <span className="text-xs">Albums</span>
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
