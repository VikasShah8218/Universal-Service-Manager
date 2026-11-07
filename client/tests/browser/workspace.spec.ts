import { test, expect, type Page } from '@playwright/test'

async function demo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible()
}

function desktopNav(page: Page, label: string) {
  return page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: label, exact: true })
}

test('demo navigation, service filters, details, logs, events, tools, and appearance', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  const apiRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) apiRequests.push(request.url())
  })
  await demo(page)
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true })
  await desktopNav(page, 'Services').click()
  await page.getByRole('textbox', { name: 'Search services' }).fill('media')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Search services' }).fill('')
  await page.getByLabel('Filter service status').selectOption('STOPPED')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByLabel('Filter service status').selectOption('all')
  await page.getByRole('link', { name: 'central-manager', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'central-manager' })).toBeVisible()
  await page.getByRole('link', { name: 'View logs', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Application startup complete')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await desktopNav(page, 'Events & audit').click()
  await page.getByRole('button', { name: 'Audit trail', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'project.start', exact: true })).toBeVisible()
  await desktopNav(page, 'Tools').click()
  await page.getByRole('button', { name: 'Check port', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Port 8000 is available' })).toBeVisible()
  await page.getByRole('button', { name: 'Resolve executable', exact: true }).click()
  await expect(page.getByText('C:/Python/python.exe', { exact: true })).toBeVisible()
  await desktopNav(page, 'Settings').click()
  await page.getByLabel('Interface theme').selectOption('graphite')
  await page.getByLabel('Accent color').selectOption('teal')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  expect(apiRequests).toEqual([])
})

test('project create, service edit, start, configuration, export, and confirmed delete', async ({
  page,
}) => {
  await demo(page)
  await desktopNav(page, 'Projects').click()
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabel('Project name', { exact: true }).fill('Browser project')
  await dialog.getByLabel('Working directory', { exact: true }).fill('D:/Projects/browser-project')
  await dialog.getByRole('button', { name: 'Add service', exact: true }).click()
  await dialog.getByLabel('Service ID', { exact: true }).fill('web')
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('link', { name: 'Browser project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Browser project', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start browser-project', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '1 / 1 services running', exact: true }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'dependencies', exact: true }).click()
  await expect(page.getByText('Starts independently', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'configuration', exact: true }).click()
  await expect(page.getByLabel('Project JSON configuration')).toHaveValue(/browser-project/)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export YAML', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('browser-project.usm.yaml')
  await page.getByRole('button', { name: 'Delete project', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Delete this project?' })
  await confirmation.getByRole('button', { name: 'Delete project', exact: true }).click()
  await expect(page).toHaveURL('/projects')
  await expect(page.getByRole('link', { name: 'Browser project', exact: true })).toHaveCount(0)
})

test('mobile login, bottom navigation, dialog menu, and narrow layouts', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.screenshot({ path: testInfo.outputPath('login-mobile.png'), fullPage: true })
  await demo(page)
  await page.screenshot({ path: testInfo.outputPath('overview-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const nav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true })
  await nav.getByRole('link', { name: 'Services', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'USM workspace' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await dialog.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('YAML import updates the demo workspace without any live API request', async ({ page }) => {
  await demo(page)
  await desktopNav(page, 'Projects').click()
  await page.getByRole('button', { name: 'Import YAML', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import project', exact: true })
  await dialog
    .getByLabel('Project YAML', { exact: true })
    .fill('id: imported\nname: Imported demo\ncwd: D:/Projects/imported\nservices: []')
  await dialog.getByRole('button', { name: 'Import project', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Imported demo', exact: true })).toBeVisible()
})
