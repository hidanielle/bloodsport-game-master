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

This app can be deployed to Render as a static site. The repository includes a [render.yaml](render.yaml) configuration that builds the app and serves the generated `dist` folder.

Render setup:

- Create a new static site on Render.
- Connect this repository.
- Render will use the build command from [render.yaml](render.yaml): `npm install && npm run build`.
- The publish directory is `dist`.
- The rewrite rule ensures client-side routes fall back to `index.html`.
