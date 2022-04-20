'use strict'

// Imports
const { chromium } = require('playwright')
const term = require('terminal-kit').terminal
const fetch = require('cross-fetch')
const adblocker = require('@cliqz/adblocker-playwright').PlaywrightBlocker

// Define command line flags
const argv = require('yargs')
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
  const ansiEscapes = (await import('ansi-escapes')).default
  console.log(`Loading URL: ${argv.url}`)
  console.log(`Screen width: ${argv.width}`)
  console.log(`Block ads: ${argv.adblock}`)

  const height = parseInt((argv.width / term.width) * term.height * 2.4)

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: argv.width, height } })

  term.clear()
  term.hideCursor(true)

  // Start streaming frames
  const client = await page.context().newCDPSession(page)
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 80 })
  client.on('Page.screencastFrame', async (frame) => {
    if (process.env.TERM_PROGRAM !== 'iTerm.app') {
      await term.clear()
      await term.drawImage(`data:image/jpeg;base64,${frame.data}`, { shrink: { width: term.width, height: term.height } })
    } else {
      console.log(ansiEscapes.image(Buffer.from(frame.data, 'base64'), { height: '100%' }))
    }
    await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
  })

  if (argv.adblock) {
    adblocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
      blocker.enableBlockingInPage(page)
    })
  }

  // Handle keys
  term.on('key', async (name, matches, data) => {
    // See: https://playwright.dev/docs/api/class-keyboard#keyboard-press
    switch (name) {
      case 'CTRL_C':
        term.grabInput(false)
        term.hideCursor(false)
        await browser.close()
        process.exit()
      case 'ESCAPE':
      case 'ENTER':
      case 'BACKSPACE':
      case 'DELETE':
        await page.keyboard.press(name.charAt(0) + name.slice(1).toLowerCase())
        break
      case 'LEFT':
      case 'RIGHT':
      case 'UP':
      case 'DOWN':
        await page.keyboard.press('Arrow' + name.charAt(0) + name.slice(1).toLowerCase())
        break
      default:
        await page.keyboard.press(name)
    }
  })

  // Handle mouse events
  term.on('mouse', async (name, data) => {
    if (name === 'MOUSE_LEFT_BUTTON_RELEASED') {
      const x = argv.width / term.width * data.x
      const y = height / term.height * data.y
      await page.mouse.click(x, y)
    }
  })
  term.grabInput({ mouse: 'button' })

  // Update terminal title
  page.on('framenavigated', async (frame) => {
    try {
      const title = await frame.title()
      term.windowTitle(title)
    } catch (e) { }
  })

  // Load requested page
  await page.goto(argv.url)
})()
