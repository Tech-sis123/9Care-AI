const { join } = require('path');

/**
 * Keep Puppeteer's downloaded Chrome inside the project, so it is still there when
 * the server runs (on Render, ~/.cache from the build step is not kept at runtime).
 * whatsapp-web.js uses this Chrome on Linux; on Windows the installed Chrome is used.
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  // WhatsApp runs full Chrome; the separate "headless shell" build is never used
  'chrome-headless-shell': { skipDownload: true },
};
