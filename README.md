# MeioNovel plugin repository

This packages LNReader's existing Madara plugin for MeioNovel, with source-specific fixes:

- Uses the site's browser-style request headers.
- Resolves relative cover URLs and falls back to the Open Graph cover.
- Retries the legacy chapter-list endpoint and then chapter links on the novel page if the new Madara endpoint returns no chapters.
- Searches `.reading-content` and other known containers, then scores paragraph-heavy containers when normal selectors miss the chapter body.
- Splits `<br>`-separated chapter text into separate paragraphs for the reader and TTS.

To publish, upload `meionovel.js`, `icon.png`, and `plugins.min.json` to your GitHub repo. Add the raw manifest URL under **Settings → Plugin Repositories** in LNReader, refresh **Browse → Plugins**, then install/update **MeioNovel**. Disable LNReader's official plugin repository while using this copy to avoid a duplicate `meionovel` ID.
