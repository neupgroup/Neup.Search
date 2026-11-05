import { chromium } from "playwright"

export type CrawlHtmlOptions = {
  javascriptEnabled?: boolean
  timeoutMs?: number
  userAgent?: string
}

export type CrawlHtmlResult = {
  url: string
  title: string
  html: string
  statusCode: number | null
}

// Scroll through the document in steps to trigger lazy-loaded page content.
async function triggerLazyContent(page: import("playwright").Page): Promise<void> {
  await page.evaluate(async () => {
    let position = 0
    let previousHeight = 0
    let stableSteps = 0
    const step = Math.max(window.innerHeight, 500)

    while (stableSteps < 3 && position < 100_000) {
      const currentHeight = document.documentElement.scrollHeight
      if (currentHeight === previousHeight) stableSteps += 1
      else stableSteps = 0
      previousHeight = currentHeight
      window.scrollTo(0, position)
      position += step
      await new Promise((resolve) => window.setTimeout(resolve, 150))
    }

    window.scrollTo(0, 0)
  })
}

// Render one page in Chromium and return its complete post-JavaScript document HTML.
export async function crawlPageToHtml(url: string, options: CrawlHtmlOptions = {}): Promise<CrawlHtmlResult> {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      javaScriptEnabled: options.javascriptEnabled ?? true,
      ignoreHTTPSErrors: true,
      userAgent: options.userAgent,
    })
    const page = await context.newPage()
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs ?? 30_000,
    })

    if (options.javascriptEnabled !== false) {
      await page.waitForLoadState("networkidle", { timeout: options.timeoutMs ?? 30_000 }).catch(() => undefined)
      await triggerLazyContent(page)
    }

    return {
      url: page.url(),
      title: await page.title(),
      html: await page.evaluate(() => document.documentElement.outerHTML),
      statusCode: response?.status() ?? null,
    }
  } finally {
    await browser.close()
  }
}
