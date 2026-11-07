import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'

// This test creates a separate manager and database. It never connects to the developer's daemon.
const clientDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const managerDirectory = path.resolve(clientDirectory, '../service_manager')
const python =
  process.env.USM_TEST_PYTHON ||
  path.join(
    managerDirectory,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  )
if (!existsSync(python))
  throw new Error(
    'Backend virtual environment not found. Set USM_TEST_PYTHON to a Python executable with the manager dependencies installed.',
  )

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitFor(url, processHandle) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (processHandle.exitCode !== null)
      throw new Error('An isolated test server exited before it became ready.')
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      /* Wait for server startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Isolated test server did not start: ${url}`)
}

function launch(executable, args, options) {
  const child = spawn(executable, args, {
    ...options,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Drain output without writing potentially sensitive environment details to disk.
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  child.on('error', (error) => console.error('Test process failed:', error.message))
  return child
}

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'usm-client-live-'))
const managerPort = await freePort()
const clientPort = await freePort()
const managerUrl = `http://127.0.0.1:${managerPort}`
const clientUrl = `http://127.0.0.1:${clientPort}`
const projectId = 'client-smoke'
let browser
let manager
let frontend
let token
try {
  manager = launch(
    python,
    [
      '-m',
      'uvicorn',
      'main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(managerPort),
      '--log-level',
      'warning',
    ],
    {
      cwd: managerDirectory,
      env: {
        ...process.env,
        DATA_DIR: path.join(temporaryDirectory, 'data'),
        DATABASE_URL: `sqlite://${path.join(temporaryDirectory, 'smoke.sqlite3').replaceAll('\\', '/')}`,
        WATCHDOG_STALL_SECONDS: '0',
        STOP_SERVICES_ON_EXIT: 'true',
      },
    },
  )
  await waitFor(`${managerUrl}/api/v1/health`, manager)
  token = (await readFile(path.join(temporaryDirectory, 'data/token'), 'utf8')).trim()
  frontend = launch(
    process.execPath,
    [
      path.join(clientDirectory, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(clientPort),
      '--strictPort',
    ],
    { cwd: clientDirectory, env: { ...process.env, USM_API_TARGET: managerUrl } },
  )
  await waitFor(clientUrl, frontend)
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(clientUrl)
  await page.getByLabel('Manager API token', { exact: true }).fill(token)
  await page.getByRole('button', { name: 'Connect to workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible()
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'New project' })
  await form.getByLabel('Project name', { exact: true }).fill('Client smoke')
  await form.getByLabel('Working directory', { exact: true }).fill(temporaryDirectory)
  await form.getByRole('button', { name: 'Add service', exact: true }).click()
  await form.getByLabel('Service ID', { exact: true }).fill('smoke-service')
  await form
    .getByLabel('Command — one argument per line', { exact: false })
    .fill(
      [
        python,
        '-u',
        '-c',
        "import time; print('client smoke ready', flush=True); time.sleep(120)",
      ].join('\n'),
    )
  await form.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(form).not.toBeVisible()
  await page.getByRole('link', { name: 'View Client smoke', exact: true }).click()
  await page.getByRole('button', { name: 'Start client-smoke', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '1 / 1 services running', exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await page.getByRole('link', { name: 'smoke-service', exact: true }).click()
  await page.getByRole('link', { name: 'View logs', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('client smoke ready', { timeout: 15000 })
  await page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Events & audit', exact: true })
    .click()
  await expect(page.getByText(/HEALTHY/).first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Audit trail', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'project.create', exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Projects', exact: true })
    .click()
  await page.getByRole('link', { name: 'View Client smoke', exact: true }).click()
  const exportEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export YAML', exact: true }).click()
  if ((await exportEvent).suggestedFilename() !== `${projectId}.usm.yaml`)
    throw new Error('Unexpected export filename')
  await page.getByRole('button', { name: 'Stop client-smoke', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '0 / 1 services running', exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Delete project', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Delete this project?' })
    .getByRole('button', { name: 'Delete project', exact: true })
    .click()
  await expect(page).toHaveURL(`${clientUrl}/projects`)
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  console.log(
    'PASS: isolated real manager — token login, project/service creation, process start, real log capture, events/audit, YAML export, process stop, and project deletion.',
  )
} finally {
  // Always stop the test project first, even if a browser assertion failed mid-flow.
  if (token) {
    await fetch(`${managerUrl}/api/v1/projects/${projectId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-USM-Token': token },
      body: JSON.stringify({ action: 'stop' }),
      signal: AbortSignal.timeout(20000),
    }).catch(() => {})
    await fetch(`${managerUrl}/api/v1/projects/${projectId}`, {
      method: 'DELETE',
      headers: { 'X-USM-Token': token },
      signal: AbortSignal.timeout(20000),
    }).catch(() => {})
  }
  await browser?.close()
  for (const child of [frontend, manager]) {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  }
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(temporaryDirectory))
  if (
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    path.basename(temporaryDirectory).startsWith('usm-client-live-')
  ) {
    await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
