<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/548efd16-cbda-4c7e-8614-9f99623eb82d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push this repository to GitHub and import it in Vercel. Keep the project root at the repository root; `vercel.json` configures the Vite output and API function.
2. Add `GEMINI_API_KEY` in the Vercel project environment settings if you want Gemini-powered chat. The local recommendation fallback works without it.
3. Deploy, then verify `/api/health`.

The catalog JSON is bundled with the API function as read-only seed data. Vercel's function filesystem is ephemeral, so catalog import, reset, and cleanup endpoints return `501` on Vercel; use a persistent database/storage service if live catalog edits are needed. Configure Firebase's authorized domains with the deployed Vercel domain if Firebase sign-in is enabled.

## Catalog Data

The app prefers `src/data/books_store.json` and cleans the catalog at startup and after imports. It removes duplicate ISBN/title-author records, entries without a usable title or synopsis, and limits the catalog to 52,000 books. The compressed and legacy datasets are fallback sources; cleaned data is saved to the writable JSON store.
