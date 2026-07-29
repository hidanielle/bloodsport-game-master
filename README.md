# Bloodsport GM App

A lightweight React app for a single game master to manage Bloodsport sessions.

## Features

- Create a game with a name and date.
- Add players and their characters.
- Randomize even 1v1 matchups.
- Enter player bets for each match.
- Select a match winner and compute payout/net values.
- Leaderboard for total net won across completed matches.
- Saved locally in browser storage.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for deployment:

```bash
npm run build
```

## Deployment

This app can be deployed to Render as a static site. Configure Render to serve the built `dist` folder.
