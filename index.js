'use strict';

// Imports
const { chromium } = require('playwright');
const ansiEscapes = require('ansi-escapes');
const term = require('terminal-kit').terminal;
const fetch = require('cross-fetch');
const { number } = require('yargs');
const adblocker = require('@cliqz/adblocker-playwright').PlaywrightBlocker;

// Define command line flags
var argv = require('yargs')
  .command({
    command: '$0 [url]',
    desc: 'Start Termser and load URL',
    builder: (yargs) => {
      yargs.positional('url', {
        describe: 'a unique identifier for the server',
        default: 'https://www.google.com/'
      })
    }
  })
  .option('width', {
    alias: 'w',
    type: 'number',
    description: 'Viewport width',
    default: 1024
  })
  .option('adblock', {
    alias: 'a',
    type: 'boolean',
    description: 'Block ads and trackers',
    default: true
  })
  .help('h')
  .alias('h', 'help')
  .argv;

// Start process
(async () => {
  console.log(`Loading URL: ${argv.url}`);
  console.log(`Screen width: ${argv.width}`);
  console.log(`Block ads: ${argv.adblock}`);

  const height = parseInt((argv.width / term.width) * term.height * 2.4);

  const browser = await chromium.launch({ executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary' });
  const page = await browser.newPage({ viewport: { width: argv.width, height } });

  if (argv.adblock) {
    adblocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
      blocker.enableBlockingInPage(page);
    });
  }

  // Handle keys
  term.on('key', async (name, matches, data) => {
    // See: https://playwright.dev/#version=v1.3.0&path=docs%2Fapi.md&q=keyboardpresskey-options
    switch (name) {
      case 'CTRL_C':
        term.grabInput(false);
        term.hideCursor(false);
        await browser.close();
        process.exit();
      case 'ESCAPE':
      case 'ENTER':
      case 'BACKSPACE':
      case 'DELETE':
        await page.keyboard.press(name.charAt(0) + name.slice(1).toLowerCase());
        break;
      case 'LEFT':
      case 'RIGHT':
      case 'UP':
      case 'DOWN':
        await page.keyboard.press('Arrow' + name.charAt(0) + name.slice(1).toLowerCase());
        break;
      default:
        await page.keyboard.press(name);
    }
  });

  // Handle mouse events
  term.on('mouse', async (name, data) => {
    if (name == 'MOUSE_LEFT_BUTTON_RELEASED') {
      var x = argv.width / term.width * data.x;
      var y = height / term.height * data.y;
      await page.mouse.click(x, y);
    }
  });
  term.grabInput({ mouse: 'button' });

  // Update terminal title
  page.on('framenavigated', async (frame) => {
    const title = await frame.title();
    term.windowTitle(title);
  });

  // Load requested page
  await page.goto(argv.url);

  term.clear();
  term.hideCursor(true);

  // Acquire a screenshot every half a second and update the terminal
  (async function getScreenshot() {
    /*
    // Alternative way, not using this since the resolution is too low
    const screenshot = await page.screenshot({ type: 'png', path: '/tmp/termser.png' });
    term.drawImage('/tmp/termser.png', { width: term.width, height: term.height });
    */
    try {
      const screenshot = await page.screenshot({ type: 'png' });
      const buffer = Buffer.from(screenshot, 'base64');
      console.log(ansiEscapes.image(buffer, { height: '100%' }));
    } catch (e) { }
    setInterval(getScreenshot, 500);
  })();
})();