'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Home, Music, Mic, User, AudioLines, DiscAlbum, Disc3, Settings, X } from 'lucide-react'
import Script from 'next/script';
import { motion } from "framer-motion"
import Image from "next/image"
import { UserInfoSkeleton, TrackSkeleton, TopItemSkeleton, BottomNavSkeleton } from "@/components/Skeletons"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
            setError('Failed to validate Telegram data');
            setUserNotFound(true);
            return;
          }

          const result = await response.json();

          if (result.allData) {
            const userData = JSON.parse(result.allData.user); 
            setTGUser(userData);
            settestdata(result.allData);
            const lastfmUsername = await fetchLastFmUsername();
            if (lastfmUsername) {
              setUser({ _id: userData.id, lastfm_username: lastfmUsername });
              setUserNotFound(false);
            } else {
              setError('User not found or Last.fm username not set');
              setUserNotFound(true);
            }
          }
        } catch (error) {
          showAlert('An error occurred while validating your data.');
          setError(error instanceof Error ? error.message : 'An unknown error occurred');
          setUserNotFound(true);
        } finally {
          setLoading(false);
        }
      };

      validateTelegramData();
      if (telegram.SettingsButton) {
        telegram.SettingsButton.show();
        telegram.SettingsButton.onClick(() => setIsSettingsOpen(true));
      }
    }
    return () => {
      if (typeof window !== 'undefined' && (window as any).Telegram && (window as any).Telegram.WebApp) {
        const telegram = (window as any).Telegram.WebApp;
        if (telegram.SettingsButton) {
          telegram.SettingsButton.hide();
          telegram.SettingsButton.offClick(() => setIsSettingsOpen(true));
        }
      }
    };
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
  }, [user, activeTab, period, error]);

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
      showAlert(`Error fetching ${dataType}`);
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

  const fetchLastFmUsername = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      (window as any).Telegram.WebApp.CloudStorage.getItem('lastfm_username', (error: Error | null, value: string | null) => {
        if (error) {
          console.error("Error fetching Last.fm username:", error);
          showAlert('Failed to fetch Last.fm username');
          setError("Failed to fetch Last.fm username");
          setUserNotFound(true);
          resolve(null);
        } else if (!value) {
          showAlert('User not found or Last.fm username not set');
          setError("User not found or Last.fm username not set");
          setUserNotFound(true);
          resolve(null);
        } else {
          console.log("Fetched Last.fm username from CloudStorage:", value);
          resolve(value);
        }
      });
    });
  };

  const saveLastFmUsername = async (username: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      (window as any).Telegram.WebApp.CloudStorage.setItem('lastfm_username', username, (error: Error | null, success: boolean) => {
        if (error || !success) {
          reject(new Error('Failed to save Last.fm username'));
        } else {
          resolve();
        }
      });
    });
  };

  const removeLastFmUsername = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      (window as any).Telegram.WebApp.CloudStorage.removeItem('lastfm_username', (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  };

  useEffect(() => {
    console.log("User state updated:", user);
  }, [user]);

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
        if (response.status === 404) {
          throw new Error('Invalid Last.fm username. Please update your username in settings.');
        }
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
      setError(`${err instanceof Error ? err.message : 'Unknown error'}`);
      if (err instanceof Error && err.message.includes('Invalid Last.fm username')) {
        showAlert('Invalid Last.fm username. Please update your username in settings.');
        setIsSettingsOpen(true);
      }
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
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const username = (e.target as HTMLFormElement).username.value;
                  if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,14}$/.test(username)) {
                    showAlert('Invalid username. It should be 2-15 characters long, start with a letter, and contain only letters, numbers, underscores, or hyphens.');
                    return;
                  }
                  try {
                    await saveLastFmUsername(username);
                    if (tguser) {
                      setUser({ _id: tguser.id, lastfm_username: username });
                      setUserNotFound(false);
                    } else {
                      throw new Error('Telegram user data not available');
                    }
                  } catch (error) {
                    console.error("Error saving Last.fm username:", error);
                    showAlert('Failed to save Last.fm username. Please try again.');
                  }
                }}>
                  <div className="mt-4 space-y-2">
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                      Enter your Last.fm username
                    </label>
                    <input
                      type="text"
                      id="username"
                      name="username"
                      placeholder="Your Last.fm username"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                      minLength={2}
                      maxLength={15}
                      pattern="^[a-zA-Z][a-zA-Z0-9_-]*$"
                    />
                    <p className="text-xs text-gray-500">
                      Username should be 2-15 characters, start with a letter, and contain only letters, numbers, underscores, or hyphens.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="mt-4 w-full bg-blue-500 hover:bg-blue-700 text-white"
                    variant="default"
                  >
                    Set Username
                  </Button>
                </form>
              </>
            ) : (
              <>              
                <p>An error occurred while loading your data.</p>
                <p>Please try again later or contact support.</p>
              </>
            )}
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
                <div className="flex items-center">
                  <h2 className="text-2xl font-bold">{tguser?.first_name || userInfo?.name}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
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
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              onClick={() => setIsSettingsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <CardHeader>
              <CardTitle>Last.fm Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const username = (e.target as HTMLFormElement).username.value;
                if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,14}$/.test(username)) {
                  showAlert('Invalid username. It should be 2-15 characters long, start with a letter, and contain only letters, numbers, underscores, or hyphens.');
                  return;
                }
                try {
                  await saveLastFmUsername(username);
                  if (tguser) {
                    setUser({ _id: tguser.id, lastfm_username: username });
                    setIsSettingsOpen(false);
                    setUserNotFound(false);
                    setError(null);
                    fetchData();
                    showAlert('Last.fm username updated successfully.');
                  } else {
                    throw new Error('Telegram user data not available');
                  }
                } catch (error) {
                  console.error("Error saving Last.fm username:", error);
                  showAlert('Failed to save Last.fm username. Please try again.');
                }
              }}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      type="text"
                      id="username"
                      name="username"
                      defaultValue={user?.lastfm_username || ''}
                      className="w-full"
                      required
                      minLength={2}
                      maxLength={15}
                      pattern="^[a-zA-Z][a-zA-Z0-9_-]{1,14}$"
                    />
                    <p className="text-sm text-muted-foreground">
                      Username should be 2-15 characters, start with a letter, and contain only letters, numbers, underscores, or hyphens.
                    </p>
                  </div>
                  <div className="flex justify-between gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        try {
                          await removeLastFmUsername();
                          setUser(prev => prev ? { ...prev, lastfm_username: undefined } : null);
                          setIsSettingsOpen(false);
                          setUserNotFound(true);
                          showAlert('Last.fm username removed successfully.');
                        } catch (error) {
                          console.error("Error removing Last.fm username:", error);
                          showAlert('Failed to remove Last.fm username. Please try again.');
                        }
                      }}
                    >
                      Remove Username
                    </Button>
                    <Button type="submit" className="w-full">
                      Update Username
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  )
}