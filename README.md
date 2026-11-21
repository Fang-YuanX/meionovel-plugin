# MeioNovel plugin repository

This packages LNReader's Madara plugin for MeioNovel with source-specific fixes. The published `meionovel.js` and TypeScript source `meionovel.ts` should be kept in sync.

The plugin retries the chapter list through Madara's POST endpoint and a GET fallback, uses the legacy admin-AJAX endpoint when needed, and parses chapter content using the common Madara selectors. It does not expose diagnostic/network response data in novel summaries.

To publish, upload `meionovel.js`, `icon.png`, and `plugins.min.json` to your GitHub repo. Add the raw manifest URL under **Settings → Plugin Repositories** in LNReader, refresh **Browse → Plugins**, then install/update **MeioNovel**. Disable LNReader's official plugin repository while using this copy to avoid a duplicate `meionovel` ID.
