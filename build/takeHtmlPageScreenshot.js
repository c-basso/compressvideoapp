const { chromium } = require('playwright');

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** @param {ScreenshotOptions} options */
const takeHtmlPageScreenshot = async (options) => {
  const { htmlPath, url, screenshotPath, width, height } = options;

  console.log();
  console.log('[takeHtmlPageScreenshot] Starting screenshot with options:', options);

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width, height });

    const targetUrl = url ? url : `file://${htmlPath}`;
    console.log('[takeHtmlPageScreenshot] Navigating to:', targetUrl);

    page.setDefaultNavigationTimeout(60000);

    await page.goto(targetUrl, { waitUntil: 'load' });
    console.log('[takeHtmlPageScreenshot] Page loaded (load event fired), waiting before screenshot...');

    await wait(100);
    await page.screenshot({ path: screenshotPath });
    console.log('[takeHtmlPageScreenshot] Screenshot saved to:', screenshotPath);
  } catch (e) {
    console.error('[takeHtmlPageScreenshot] Error while taking screenshot:', e);
  }

  await browser.close();
  console.log('[takeHtmlPageScreenshot] Browser closed, done.');
};

module.exports = { takeHtmlPageScreenshot };
