# Privacy Policy

**Bookmark Sync (Gist)** is committed to protecting your privacy.

## Data Collection and Usage

- **No Personal Data Collected:** The extension does not collect, log, or track your personal information, browsing history, or identities.
- **Bookmarks:** The extension reads your browser bookmarks only to sync them with the private GitHub Gist you configure, and writes bookmarks back when you download from that Gist.
- **Settings Storage:** Your settings (GitHub personal access token, Gist ID, and notification preference) are stored in your browser's extension sync storage (`chrome.storage.sync`), which your browser may sync across your own signed-in devices. Sync status such as bookmark counts is stored in local extension storage (`chrome.storage.local`).
- **Direct Requests:**
  - Your bookmarks are sent directly from the extension to the GitHub API (`https://api.github.com/*`) and stored in a private Gist under your own GitHub account.
  - Large Gist files are downloaded directly from GitHub (`https://*.githubusercontent.com/*`).
  - No intermediate servers or third parties receive your bookmarks or token.
- **No Analytics or Telemetry:** There are no third-party analytics, tracking scripts, or telemetry embedded in the extension.
- **Data Sharing:** We do not sell, rent, trade, or transfer any user data to third parties.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/xianghongai/browser-bookmark-sync/issues
