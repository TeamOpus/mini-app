'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Home, Music, Mic, User, DiscAlbum, Disc3, Settings, X, Play } from 'lucide-react'
import { motion } from "framer-motion"
import Image from "next/image"
import { UserInfoSkeleton, TrackSkeleton, TopItemSkeleton, BottomNavSkeleton } from "@/components/Skeletons"

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  duration_ms: number;
  external_urls: { spotify: string };
}

interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  followers: { total: number };
  external_urls: { spotify: string };
}

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { name: string }[];
  images: { url: string }[];
  total_tracks: number;
  release_date: string;
  external_urls: { spotify: string };
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: { total: number };
  owner: { display_name: string };
  external_urls: { spotify: string };
}

interface SpotifyUserProfile {
  id: string;
  display_name: string;
  email?: string;
  country?: string;
  images: { url: string }[];
  followers: { total: number };
  product?: string;
}

interface RecentTrack {
  track: SpotifyTrack;
  played_at: string;
}

type User = {
  _id: number;
  spotify_connected?: boolean;
  access_token?: string;
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
    tracks: SpotifyTrack[];
    artists: SpotifyArtist[];
    albums: SpotifyAlbum[];
    lastFetched: number;
  };
};

function formatTimeAgo(timestamp: string) {
  const now = new Date();
  const then = new Date(timestamp);
  const delta = now.getTime() - then.getTime();
  const seconds = Math.floor(delta / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} days ago`;
  else if (hours > 0) return `${hours} hours ago`;
  else if (minutes > 0) return `${minutes} minutes ago`;
  else return "Just now";
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SpotifyPage() {
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([])
  const [topArtists, setTopArtists] = useState<SpotifyArtist[]>([])
  const [savedAlbums, setSavedAlbums] = useState<SpotifyAlbum[]>([])
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null)
  const [recentTracks, setRecentTracks] = useState<RecentTrack[]>([])
  const [userProfile, setUserProfile] = useState<SpotifyUserProfile | null>(null);
  const [period, setPeriod] = useState<Period>('7day')
  const [user, setUser] = useState<User | null>(null);
  const [tguser, setTGUser] = useState<any>(null);
  const [userNotFound, setUserNotFound] = useState(false);
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [activeTab, setActiveTab] = useState<'recent' | 'tracks' | 'artists' | 'albums' | 'playlists'>('recent');
  const [testdata, settestdata] = useState<any>(null);
  const [cachedData, setCachedData] = useState({} as CachedData);
  const [isLoading, setIsLoading] = useState<{
    tracks: boolean;
    artists: boolean;
    albums: boolean;
    playlists: boolean;
  }>({
    tracks: false,
    artists: false,
    albums: false,
    playlists: false,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentPlayingUrl, setCurrentPlayingUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Memoize showAlert to prevent recreation
  const showAlert = useCallback((message: string) => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const telegram = (window as any).Telegram.WebApp;
      telegram.HapticFeedback?.impactOccurred('heavy');
      telegram.showAlert(message);
    }
  }, []);

  // Memoize playTrack with useCallback
  const playTrack = useCallback(async (spotifyUrl: string) => {
    try {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }

      const response = await fetch(`/api/download?url=${encodeURIComponent(spotifyUrl)}`);
      const data = await response.json();

      if (data.success && data.data.downloadLinks?.[0]) {
        const downloadUrl = data.data.downloadLinks[0].url;
        const audio = new Audio(downloadUrl);
        audio.play();

        setAudioElement(audio);
        setCurrentPlayingUrl(spotifyUrl);
        setIsPlaying(true);

        audio.onended = () => {
          setIsPlaying(false);
          setCurrentPlayingUrl(null);
        };
      } else {
        showAlert('Failed to load track for playback');
      }
    } catch (error) {
      console.error('Playback error:', error);
      showAlert('Error playing track');
    }
  }, [audioElement, showAlert]);

  // Fetch data functions
  const fetchData = useCallback(async () => {
    if (!user?.spotify_connected || retryAttempts >= 3) return;

    try {
      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query_string: testdata, 
          signature: testdata?.signature,
          access_token: accessToken 
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch data from Spotify');

      const data = await response.json();
      if (data.error) throw new Error(data.message || 'Unknown error occurred');

      setCurrentTrack(data.currentTrack);
      setRecentTracks(data.recentTracks);
      setUserProfile(data.userProfile);
      setError(null);
      setRetryAttempts(0);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Unknown error'}`);
      setRetryAttempts(prev => prev + 1);
    }
  }, [user?.spotify_connected, testdata, accessToken, retryAttempts]);

  const shouldFetchData = useCallback((dataType: 'tracks' | 'artists' | 'albums') => {
    const cachedPeriodData = cachedData[period];
    if (!cachedPeriodData?.[dataType]?.length) return true;

    const timeSinceLastFetch = Date.now() - cachedPeriodData.lastFetched;
    return timeSinceLastFetch > 5 * 60 * 1000;
  }, [cachedData, period]);

  const fetchTopData = useCallback(async (dataType: 'tracks' | 'artists') => {
    if (!user?.spotify_connected || !shouldFetchData(dataType)) return;

    setIsLoading(prev => ({ ...prev, [dataType]: true }));

    try {
      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_string: testdata,
          signature: testdata?.signature,
          access_token: accessToken,
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

    } catch (err) {
      showAlert(`Error fetching ${dataType}`);
      setError(`Error fetching ${dataType}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(prev => ({ ...prev, [dataType]: false }));
    }
  }, [user?.spotify_connected, period, testdata, accessToken, shouldFetchData, showAlert]);

  const fetchPlaylists = useCallback(async () => {
    if (!user?.spotify_connected) return;

    setIsLoading(prev => ({ ...prev, playlists: true }));

    try {
      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_string: testdata,
          signature: testdata?.signature,
          access_token: accessToken,
          type: 'playlists',
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch playlists');

      const data = await response.json();
      setPlaylists(data.playlists);

    } catch (err) {
      showAlert('Error fetching playlists');
      setError(`Error fetching playlists: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(prev => ({ ...prev, playlists: false }));
    }
  }, [user?.spotify_connected, testdata, accessToken, showAlert]);

  const fetchSavedAlbums = useCallback(async () => {
    if (!user?.spotify_connected) return;

    setIsLoading(prev => ({ ...prev, albums: true }));

    try {
      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_string: testdata,
          signature: testdata?.signature,
          access_token: accessToken,
          type: 'albums',
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch albums');

      const data = await response.json();
      setSavedAlbums(data.albums);

    } catch (err) {
      showAlert('Error fetching albums');
      setError(`Error fetching albums: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(prev => ({ ...prev, albums: false }));
    }
  }, [user?.spotify_connected, testdata, accessToken, showAlert]);

  // Initial Telegram validation
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const telegram = (window as any).Telegram.WebApp;
      telegram.ready();
      const initData = telegram.initData;

      const validateTelegramData = async () => {
        try {
          const response = await fetch('/api/validspotify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            setUser({ _id: userData.id, spotify_connected: true });
            setUserNotFound(false);
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

      return () => {
        if (telegram.SettingsButton) {
          telegram.SettingsButton.hide();
          telegram.SettingsButton.offClick(() => setIsSettingsOpen(true));
        }
      };
    }
  }, [showAlert]);

  // Data fetching based on active tab
  useEffect(() => {
    if (!user?.spotify_connected) return;

    let interval: NodeJS.Timeout | null = null;

    if (activeTab === 'recent') {
      fetchData();
      interval = setInterval(fetchData, 30000);
    } else if (activeTab === 'playlists') {
      fetchPlaylists();
    } else if (activeTab === 'albums') {
      fetchSavedAlbums();
    } else {
      fetchTopData(activeTab as 'tracks' | 'artists');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user, activeTab, period, fetchData, fetchTopData, fetchPlaylists, fetchSavedAlbums]);

  const renderTopContent = useCallback((dataType: 'tracks' | 'artists') => {
    const data = cachedData[period]?.[dataType] || [];
    const isDataLoading = isLoading[dataType];

    return (
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">
            Top {dataType.charAt(0).toUpperCase() + dataType.slice(1)} - {periodLabels[period]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(periodLabels) as Period[]).map((key) => (
              <Button
                key={key}
                onClick={() => setPeriod(key)}
                className={`flex-grow sm:flex-grow-0 transition-colors duration-150 ${
                  period === key
                    ? 'bg-black text-white hover:bg-gray-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } border-none`}
              >
                {periodLabels[key]}
              </Button>
            ))}
          </div>

          {isDataLoading ? (
            <div className="space-y-3">
              {Array(10).fill(0).map((_, i) => (
                <TopItemSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {data.map((item: SpotifyTrack | SpotifyArtist, index: number) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg font-bold text-gray-400 w-8">{index + 1}</span>

                  {dataType === 'tracks' && 'album' in item && (
                    <>
                      <Image
                        src={item.album.images[0]?.url || '/placeholder.png'}
                        alt={item.name}
                        width={48}
                        height={48}
                        className="rounded"
                      />
                      <div className="flex-1">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm text-gray-600">
                          {item.artists.map(a => a.name).join(', ')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => playTrack(item.external_urls.spotify)}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    </>
                  )}

                  {dataType === 'artists' && 'followers' in item && (
                    <>
                      <Image
                        src={item.images[0]?.url || '/placeholder.png'}
                        alt={item.name}
                        width={48}
                        height={48}
                        className="rounded-full"
                      />
                      <div className="flex-1">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm text-gray-600">
                          {item.followers.total.toLocaleString()} followers
                        </p>
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }, [period, cachedData, isLoading, playTrack]);

  // Script is loaded in _app or _document instead
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-lg">Validating you...</p>
      </div>
    );
  }

  if (userNotFound) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">
              Spotify integration is automatic. No setup needed!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="w-full max-w-3xl mx-auto p-4 space-y-4">

        {!userProfile || !tguser ? (
          <UserInfoSkeleton />
        ) : (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage 
                    src={userProfile.images[0]?.url || tguser?.photo_url} 
                    alt={userProfile.display_name} 
                  />
                  <AvatarFallback>
                    <User className="w-8 h-8" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">
                    {userProfile.display_name || tguser?.first_name}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {userProfile.followers?.total.toLocaleString()} followers • {userProfile.country || 'Global'}
                  </p>
                  {userProfile.product && (
                    <p className="text-xs text-green-600 font-semibold mt-1">
                      {userProfile.product.toUpperCase()}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'recent' && (
          <>
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Now Playing</CardTitle>
              </CardHeader>
              <CardContent>
                {currentTrack ? (
                  <div className="flex items-center gap-4">
                    {currentTrack.album.images[0] ? (
                      <Image
                        src={currentTrack.album.images[0].url}
                        alt={currentTrack.name}
                        width={80}
                        height={80}
                        className="rounded-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                        <Music className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">{currentTrack.name || ''}</h3>
                      <p className="text-gray-600">
                        {currentTrack.artists.map(a => a.name).join(', ')}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatDuration(currentTrack.duration_ms)}
                      </p>
                    </div>
                    <Button
                      size="lg"
                      onClick={() => playTrack(currentTrack.external_urls.spotify)}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      <Play className="w-5 h-5" />
                    </Button>
                  </div>
                ) : (
                  <TrackSkeleton />
                )}
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Recently Played</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentTracks.length > 0 ? (
                  recentTracks.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                    >
                      {item.track.album.images[2] ? (
                        <Image
                          src={item.track.album.images[2].url}
                          alt={item.track.name}
                          width={48}
                          height={48}
                          className="rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                          <Music className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{item.track.name}</p>
                        <p className="text-xs text-gray-600">
                          {item.track.artists.map(a => a.name).join(', ')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.track.album.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {formatTimeAgo(item.played_at)}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => playTrack(item.track.external_urls.spotify)}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  Array(10).fill(0).map((_, i) => <TrackSkeleton key={i} />)
                )}
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'tracks' && renderTopContent('tracks')}
        {activeTab === 'artists' && renderTopContent('artists')}

        {activeTab === 'playlists' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Your Playlists</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading.playlists ? (
                Array(5).fill(0).map((_, i) => <TopItemSkeleton key={i} />)
              ) : (
                playlists.map((playlist, index) => (
                  <motion.div
                    key={playlist.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <Image
                      src={playlist.images[0]?.url || '/placeholder.png'}
                      alt={playlist.name}
                      width={64}
                      height={64}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">{playlist.name}</p>
                      <p className="text-sm text-gray-600">
                        by {playlist.owner.display_name} • {playlist.tracks.total} tracks
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'albums' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Saved Albums</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading.albums ? (
                Array(5).fill(0).map((_, i) => <TopItemSkeleton key={i} />)
              ) : (
                savedAlbums.map((album, index) => (
                  <motion.div
                    key={album.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <Image
                      src={album.images[0]?.url || '/placeholder.png'}
                      alt={album.name}
                      width={64}
                      height={64}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">{album.name}</p>
                      <p className="text-sm text-gray-600">
                        {album.artists.map(a => a.name).join(', ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {album.release_date} • {album.total_tracks} tracks
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        )}

      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16">
        {loading ? (
          <BottomNavSkeleton />
        ) : (
          <div className="flex items-center justify-around h-full max-w-3xl mx-auto">
            <button
              onClick={() => setActiveTab('recent')}
              className={`flex flex-col items-center justify-center w-1/5 h-full ${
                activeTab === 'recent' ? 'text-black' : 'text-gray-500'
              }`}
            >
              <Home className="w-6 h-6" />
              <span className="text-xs mt-1">Home</span>
            </button>

            <button
              onClick={() => setActiveTab('tracks')}
              className={`flex flex-col items-center justify-center w-1/5 h-full ${
                activeTab === 'tracks' ? 'text-black' : 'text-gray-500'
              }`}
            >
              <Music className="w-6 h-6" />
              <span className="text-xs mt-1">Tracks</span>
            </button>

            <button
              onClick={() => setActiveTab('artists')}
              className={`flex flex-col items-center justify-center w-1/5 h-full ${
                activeTab === 'artists' ? 'text-black' : 'text-gray-500'
              }`}
            >
              <Mic className="w-6 h-6" />
              <span className="text-xs mt-1">Artists</span>
            </button>

            <button
              onClick={() => setActiveTab('albums')}
              className={`flex flex-col items-center justify-center w-1/5 h-full ${
                activeTab === 'albums' ? 'text-black' : 'text-gray-500'
              }`}
            >
              <DiscAlbum className="w-6 h-6" />
              <span className="text-xs mt-1">Albums</span>
            </button>

            <button
              onClick={() => setActiveTab('playlists')}
              className={`flex flex-col items-center justify-center w-1/5 h-full ${
                activeTab === 'playlists' ? 'text-black' : 'text-gray-500'
              }`}
            >
              <Disc3 className="w-6 h-6" />
              <span className="text-xs mt-1">Playlists</span>
            </button>
          </div>
        )}
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Spotify Settings</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-center text-gray-600">
                Spotify integration is automatic. Your account is connected!
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
