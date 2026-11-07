import { test, expect, type Page } from '@playwright/test'
import { createDemoWorkspace } from '../../src/demo/fixtures'

async function mockManager(page: Page, shouldReject: () => boolean = () => false) {
  const workspace = createDemoWorkspace()
  await page.route('**/api/v1/**', async (route) => {
    if (route.request().headers()['x-usm-token'] !== 'browser-test-token' || shouldReject()) {
      await route.fulfill({ status: 401, json: { detail: 'missing or invalid token' } })
    } else if (route.request().url().includes('/status'))
      await route.fulfill({ json: workspace.status })
    else await route.fulfill({ json: [] })
  })
}

test('protected routes redirect; invalid credentials do not create a session', async ({ page }) => {
  await mockManager(page)
  await page.goto('/services')
  await expect(page).toHaveURL('/login')
  await page.getByLabel('Manager API token', { exact: true }).fill('invalid-token')
  await page.getByRole('button', { name: 'Connect to workspace' }).click()
  await expect(page.getByRole('alert')).toContainText('not accepted')
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate(() => sessionStorage.getItem('usm.session.v1'))).toBeNull()
})

test('valid login restores the requested route and memory-only login does not survive reload', async ({
  page,
}) => {
  await mockManager(page)
  await page.goto('/services')
  await page.getByLabel('Manager API token', { exact: true }).fill('browser-test-token')
  await page.getByRole('button', { name: 'Connect to workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'browser-test-token',
  )
  await page.reload()
  await expect(page).toHaveURL('/login')
})

test('opt-in tab session survives reload and a 401 clears the session and workspace', async ({
  page,
}) => {
  let rejected = false
  await mockManager(page, () => rejected)
  await page.goto('/login')
  await page.getByLabel('Manager API token', { exact: true }).fill('browser-test-token')
  await page.getByLabel('Keep me connected in this tab').check()
  await page.getByRole('button', { name: 'Connect to workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible()
  rejected = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate(() => sessionStorage.getItem('usm.session.v1'))).toBeNull()
  await expect(page.getByRole('link', { name: 'Shah NVR', exact: true })).toHaveCount(0)
})

test('offline manager produces an actionable login error without switching to demo', async ({
  page,
}) => {
  await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'))
  await page.goto('/login')
  await page.getByLabel('Manager API token', { exact: true }).fill('browser-test-token')
  await page.getByRole('button', { name: 'Connect to workspace' }).click()
  await expect(page.getByRole('alert')).toContainText('Cannot reach the manager')
  await expect(page).toHaveURL('/login')
})
