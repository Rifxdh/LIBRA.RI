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

## Catalog Data

The app prefers `src/data/books_store.json` and cleans the catalog at startup and after imports. It removes duplicate ISBN/title-author records, entries without a usable title or synopsis, and limits the catalog to 52,000 books. The compressed and legacy datasets are fallback sources; cleaned data is saved to the writable JSON store.
