import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: ({ browser }) => ({
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: ['storage', 'bookmarks', 'notifications'],
    host_permissions: [
      'https://api.github.com/*',
      'https://*.githubusercontent.com/*',
    ],
    browser_specific_settings: browser === 'firefox'
      ? {
          gecko: {
            id: '{f8e6167d-7457-4216-a338-a3f43f80f8c0}',
            data_collection_permissions: {
              required: ['bookmarksInfo'],
            },
          },
        }
      : undefined,
  }),
});
