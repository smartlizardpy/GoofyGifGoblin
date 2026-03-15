# Goofy GIF Goblin

A React + Vite chat app where the assistant replies with GIFs instead of text.

The app sends chat context to Gemini, asks for a JSON response containing a `gifSearchTerm`, then uses that term to fetch a GIF from Giphy.

## Features

- GIF-only bot replies
- Gemini model + optional fallback model support
- Giphy search integration
- Typing/loading indicator
- Mobile-friendly chat layout

## Tech Stack

- React 19
- Vite 8
- Lucide React icons
- Gemini API (`generateContent`)
- Giphy Search API

## Prerequisites

- Node.js 18+ (Node.js 20+ recommended)
- npm
- A Gemini API key

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_GEMINI_MODEL=gemini-3.1-flash-lite
VITE_GEMINI_FALLBACK_MODEL=gemini-2.0-flash-lite
VITE_GIPHY_API_KEY=your_giphy_api_key_or_leave_default
```

Notes:

- `VITE_GEMINI_API_KEY` is required.
- `VITE_GIPHY_API_KEY` falls back to a public development key if omitted.
- If the main model is unavailable (`NOT_FOUND`), the app retries with `VITE_GEMINI_FALLBACK_MODEL`.

## Installation

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

## Build for Production

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Lint

```bash
npm run lint
```

## How It Works

1. User sends a text message.
2. App sends chat history + system instruction to Gemini.
3. Gemini returns JSON with one key: `gifSearchTerm`.
4. App searches Giphy with that term and renders the first GIF result.
5. If no GIF is found, a fallback GIF is shown.

## Error Handling

- Missing API key: user alert before request
- Rate limit/quota errors: user alert with retry guidance
- Model not found: retry with fallback model
- API failures: fallback error GIF + alert
