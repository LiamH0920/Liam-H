import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const label = 'com.quicknotes.local'
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const launchAgentsDirectory = path.join(os.homedir(), 'Library', 'LaunchAgents')
const plistPath = path.join(launchAgentsDirectory, `${label}.plist`)
const logDirectory = path.join(os.homedir(), 'Library', 'Logs', 'QuickNotes')
const domain = `gui/${process.getuid()}`

function xml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character])
}

function runLaunchctl(args) {
  const result = spawnSync('/bin/launchctl', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}

function isMissingService(result) {
  return result.status !== 0
    && /could not find service|service not found/i.test(`${result.stdout}\n${result.stderr}`)
}

function makePlist() {
  const nodePath = process.execPath
  const npmPath = process.env.npm_execpath
  if (!npmPath) throw new Error('npm did not provide its executable path. Run this with `npm run local:install`.')

  const argumentsXml = [nodePath, npmPath, 'run', 'dev']
    .map((argument) => `<string>${xml(argument)}</string>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${argumentsXml}</array>
  <key>WorkingDirectory</key><string>${xml(appRoot)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${xml(process.env.PATH ?? '')}</string>
  </dict>
  <key>StandardOutPath</key><string>${xml(path.join(logDirectory, 'service.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDirectory, 'service-error.log'))}</string>
</dict>
</plist>
`
}

async function install() {
  if (process.platform !== 'darwin') throw new Error('Automatic local startup is supported on macOS only.')

  await mkdir(launchAgentsDirectory, { recursive: true })
  await mkdir(logDirectory, { recursive: true })
  const existing = runLaunchctl(['print', `${domain}/${label}`])
  if (existing.status === 0) {
    const stopped = runLaunchctl(['bootout', domain, plistPath])
    if (stopped.status !== 0) {
      throw new Error(`Could not stop the existing local service: ${stopped.stderr.trim()}`)
    }
  } else if (!isMissingService(existing)) {
    throw new Error(`Could not check the local service: ${existing.stderr.trim()}`)
  }

  await writeFile(plistPath, makePlist(), 'utf8')
  const loaded = runLaunchctl(['bootstrap', domain, plistPath])
  if (loaded.status !== 0) {
    throw new Error(`Could not start the local service: ${loaded.stderr.trim()}`)
  }
  console.log('Local service installed and started. Open http://localhost:5173.')
  console.log('It will start at login and relaunch automatically if it stops.')
}

async function uninstall() {
  if (process.platform !== 'darwin') throw new Error('Automatic local startup is supported on macOS only.')

  const existing = runLaunchctl(['print', `${domain}/${label}`])
  if (existing.status === 0) {
    const stopped = runLaunchctl(['bootout', domain, plistPath])
    if (stopped.status !== 0) {
      throw new Error(`Could not stop the local service: ${stopped.stderr.trim()}`)
    }
  } else if (!isMissingService(existing)) {
    throw new Error(`Could not check the local service: ${existing.stderr.trim()}`)
  }

  try {
    await readFile(plistPath)
    await rm(plistPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  console.log('Local service removed. Run `npm run dev` to start it manually.')
}

const command = process.argv[2]
if (command === 'install') await install()
else if (command === 'uninstall') await uninstall()
else throw new Error('Use `install` or `uninstall`.')
