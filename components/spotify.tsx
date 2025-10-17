'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Home, Music, Mic, User, DiscAlbum, Disc3, Settings, X, Search } from 'lucide-react'
import { motion } from "framer-motion"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { UserInfoSkeleton, TrackSkeleton, TopItemSkeleton, BottomNavSkeleton } from "@/components/Skeletons"

// Define TypeScript interfaces
interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string; id: string }[];
  album: {
    name: string;
    images: { url: string }[];
    id: string;
  };
  duration_ms: number;
  external_urls: { spotify: string };
}

interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  followers?: { total: number };
  genres?: string[];
  popularity?: number;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { name: string; id: string }[];
  images: { url: string }[];
  total_tracks: number;
  release_date: string;
  tracks?: { items: SpotifyTrack[] };
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: { total: number };
  owner: { display_name: string };
}

interface TelegramUser {
  id: string;
  first_name?: string;
  photo_url?: string;
}

interface User {
  _id: string; // Changed from number to string to match Telegram user ID
  spotify_connected?: boolean;
}

interface TelegramData {
  user: string;
  signature: string;
}

type ActiveTab = 'home' | 'tracks' | 'artists' | 'albums' | 'playlists' | 'search';

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SpotifyPage() {
  const [featuredTracks, setFeaturedTracks] = useState<SpotifyTrack[]>([]);
  const [featuredArtists, setFeaturedArtists] = useState<SpotifyArtist[]>([]);
  const [featuredAlbums, setFeaturedAlbums] = useState<SpotifyAlbum[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [tguser, setTGUser] = useState<TelegramUser | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [testdata, setTestdata] = useState<TelegramData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentPlayingUrl, setCurrentPlayingUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    tracks?: SpotifyTrack[];
    artists?: SpotifyArtist[];
    albums?: SpotifyAlbum[];
  }>({});

  const showAlert = useCallback((message: string) => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const telegram = (window as any).Telegram.WebApp;
      telegram.HapticFeedback?.impactOccurred('heavy');
      telegram.showAlert(message);
    }
  }, []);

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

  const fetchData = useCallback(async (type: string, params: any) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_string: testdata?.user,
          signature: testdata?.signature,
          type,
          ...params,
        }),
      });

      if (!response.ok) throw new Error(`Failed to fetch ${type}`);
      const data = await response.json();
      return data || null;
    } catch (err) {
      showAlert(`Error fetching ${type}`);
      console.error('Error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [testdata, showAlert]);

  const loadFeaturedPlaylists = useCallback(async () => {
    const data = await fetchData('featuredPlaylists', {});
    if (data?.playlists) {
      setFeaturedPlaylists(data.playlists.slice(0, 10));
    }
  }, [fetchData]);

  const loadGenres = useCallback(async () => {
    const data = await fetchData('genres', {});
    return data?.genres || [];
  }, [fetchData]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    const data = await fetchData('search', { query: searchQuery });
    if (data) {
      setSearchResults({
        tracks: data.tracks?.items,
        artists: data.artists?.items,
        albums: data.albums?.items,
      });
    }
  }, [searchQuery, fetchData]);

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
            const userData: TelegramUser = JSON.parse(result.allData.user);
            setTGUser(userData);
            setTestdata(result.allData);
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
    } else {
      setLoading(false);
      setUserNotFound(true);
    }
  }, [showAlert]);

  useEffect(() => {
    if (user?.spotify_connected && activeTab === 'playlists') {
      loadFeaturedPlaylists();
    }
  }, [user, activeTab, loadFeaturedPlaylists]);

  // Cleanup audio element on component unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
    };
  }, [audioElement]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-lg">Loading Spotify...</p>
      </div>
    );
  }

  if (userNotFound) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">
              Welcome to Spotify Explorer! Browse music, artists, and playlists.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage
                  src={tguser?.photo_url ?? ''}
                  alt={tguser?.first_name ?? 'User'}
                />
                <AvatarFallback>
                  <User className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">
                  {tguser?.first_name ?? 'Spotify User'}
                </h2>
                <p className="text-sm text-gray-600">
                  Explore millions of tracks, albums & playlists
                </p>
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

        {activeTab === 'home' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Welcome to Spotify Explorer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Browse music by tracks, artists, albums, and playlists. Use the navigation below to explore!
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => setActiveTab('tracks')}
                  className="h-24 flex flex-col gap-2"
                >
                  <Music className="w-8 h-8" />
                  <span>Tracks</span>
                </Button>
                <Button
                  onClick={() => setActiveTab('artists')}
                  className="h-24 flex flex-col gap-2"
                >
                  <Mic className="w-8 h-8" />
                  <span>Artists</span>
                </Button>
                <Button
                  onClick={() => setActiveTab('albums')}
                  className="h-24 flex flex-col gap-2"
                >
                  <DiscAlbum className="w-8 h-8" />
                  <span>Albums</span>
                </Button>
                <Button
                  onClick={() => setActiveTab('playlists')}
                  className="h-24 flex flex-col gap-2"
                >
                  <Disc3 className="w-8 h-8" />
                  <span>Playlists</span>
                </Button>
                <Button
                  onClick={() => setActiveTab('search')}
                  className="h-24 flex flex-col gap-2"
                >
                  <Search className="w-8 h-8" />
                  <span>Search</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'search' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Search Spotify</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Search for tracks, artists, albums..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch}>
                  <Search className="w-5 h-5" />
                </Button>
              </div>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => <TopItemSkeleton key={i} />)
              ) : (
                <div className="space-y-4 mt-4">
                  {searchResults.tracks?.map((track) => (
                    <div key={track.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50">
                      {track.album.images?.[0] && (
                        <Image
                          src={track.album.images[0].url}
                          alt={track.name}
                          width={64}
                          height={64}
                          className="rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{track.name}</p>
                        <p className="text-sm text-gray-600">
                          {track.artists.map((artist) => artist.name).join(', ')}
                        </p>
                      </div>
                      <Button onClick={() => playTrack(track.external_urls.spotify)}>
                        <Play className="w-5 h-5" />
                      </Button>
                    </div>
                  ))}
                  {searchResults.artists?.map((artist) => (
                    <div key={artist.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50">
                      {artist.images?.[0] && (
                        <Image
                          src={artist.images[0].url}
                          alt={artist.name}
                          width={64}
                          height={64}
                          className="rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{artist.name}</p>
                        <p className="text-sm text-gray-600">{artist.genres?.join(', ') || 'Artist'}</p>
                      </div>
                    </div>
                  ))}
                  {searchResults.albums?.map((album) => (
                    <div key={album.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50">
                      {album.images?.[0] && (
                        <Image
                          src={album.images[0].url}
                          alt={album.name}
                          width={64}
                          height={64}
                          className="rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{album.name}</p>
                        <p className="text-sm text-gray-600">
                          {album.artists.map((artist) => artist.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'playlists' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Featured Playlists</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => <TopItemSkeleton key={i} />)
              ) : (
                featuredPlaylists.map((playlist, index) => (
                  <motion.div
                    key={playlist.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50"
                  >
                    {playlist.images?.[0] && (
                      <Image
                        src={playlist.images[0].url}
                        alt={playlist.name}
                        width={64}
                        height={64}
                        className="rounded"
                      />
                    )}
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

        {activeTab === 'tracks' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Tracks</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Track browsing coming soon! Use search to find specific tracks.
              </p>
            </CardContent>
          </Card>
        )}

        {activeTab === 'artists' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Artists</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Artist browsing coming soon! Use search to find specific artists.
              </p>
            </CardContent>
          </Card>
        )}

        {activeTab === 'albums' && (
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Albums</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Album browsing coming soon! Use search to find specific albums.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16">
        <div className="flex items-center justify-around h-full max-w-3xl mx-auto">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center w-1/5 h-full ${
              activeTab === 'home' ? 'text-black' : 'text-gray-500'
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
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Settings</CardTitle>
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
                Spotify Explorer - Browse music without limits under Telegram Mini App Through Recreation Music!
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
