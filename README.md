# Last.FM - Telegram Mini App

A Telegram Mini App that integrates with Last.fm to provide users with a comprehensive view of their music listening habits directly within Telegram. This mini app allows users to view their current playing track, recently played tracks, and top tracks, artists, and albums over various time periods.

## Features

- Seamless integration with Telegram as a Mini App
- Real-time display of currently playing track
- List of recently played tracks
- Top tracks, artists, and albums visualization
- Time period selection for top charts (7 days, 1 month, 3 months, 6 months, 1 year, all time)
- Responsive design optimized for Telegram's interface

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up environment variables:
   - `BOT_ID`: your Telegram Bot ID 
   - `BOT_TOKEN`: Your Telegram Bot Token
   - `LASTFM_API_KEY`: Your Last.fm API Key
   - `DATABASE_NAME`: Your MongoDB database name
   - `MONGO_URL`: Your MongoDB URL

4. Deploy the application to a hosting service compatible with Next.js

5. Set up your Telegram Bot:
   - Create a bot via BotFather
   - Set the Web App URL to your deployed application URL

## Tabs

- **Home Tab**: Displays currently playing track and recently played tracks
- **Tracks Tab**: Shows top tracks for the selected time period
- **Artists Tab**: Presents top artists for the selected time period
- **Albums Tab**: Exhibits top albums for the selected time period

## Privacy and Data Handling

- The app only accesses public Last.fm data associated with the provided username
- Telegram user data is securely handled and not shared with third parties
- Last.fm usernames are stored securely for app functionality
