import { expect, test as base } from '@playwright/test'

export { expect }

/**
 * Browser flows must not hide client exceptions behind otherwise successful
 * assertions. The page fixture is scoped to one test, so no listener leaks
 * into a subsequent flow.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const errors: Error[] = []
    const onPageError = (error: Error) => errors.push(error)

    page.on('pageerror', onPageError)
    await use(page)
    page.off('pageerror', onPageError)

    if (errors.length > 0 && testInfo.status !== 'failed') {
      throw new Error(`Uncaught page error:\n${errors.map(error => error.stack ?? error.message).join('\n\n')}`)
    }
  }
})
