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
            id: '{9f637588-7cb6-48e0-8d3e-5f88ce2ca28d}',
            data_collection_permissions: {
              required: ['bookmarksInfo'],
            },
          },
        }
      : undefined,
  }),
});
