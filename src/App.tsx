import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import {
  Archive, ArrowDownAZ, ArrowUpDown, Check, CheckCheck, ChevronDown, Clock3, Copy, FileText,
  Folder, FolderPlus, Heart, Home, List, ListChecks, LayoutGrid, LogIn, LogOut, Moon, MoreHorizontal,
  Pin, Plus, Search, Settings, Sun, Trash2, Undo2, X,
} from 'lucide-react'
import './App.css'

type Note = {
  id: string
  title: string
  content: string
  folderId: string | null
  favorite: boolean
  pinned: boolean
  archived: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

type NoteFolder = { id: string; name: string }
type SettingsState = { theme: 'light' | 'dark'; fontSize: number; view: 'grid' | 'list'; sort: 'edited' | 'created' | 'alphabetical' | 'oldest' }
type Section = 'home' | 'all' | 'favorites' | 'pinned' | 'archived' | 'trash' | 'settings' | 'folder'
type WorkspaceLocation = { section: Section; activeFolderId: string; activeNoteId: string | null; query?: string }
type PersistedData = { notes: Note[]; folders: NoteFolder[]; settings: SettingsState; displayName?: string; location?: WorkspaceLocation }
type User = { id: string; email: string; verifiedAt: string | null }
type ApiError = Error & { status?: number; code?: string }
type FolderDialog = { mode: 'create'; name: string } | { mode: 'rename'; folderId: string; name: string }
type PendingAction = { type: 'deleteFolder'; folderId: string } | { type: 'permanentlyDelete'; noteId: string }

const STORAGE_KEY = 'quicknotes-data-v1'
const defaultSettings: SettingsState = { theme: 'light', fontSize: 16, view: 'grid', sort: 'edited' }
const initialData: PersistedData = { notes: [], folders: [], settings: defaultSettings, displayName: '' }
const allowedTags = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'DIV', 'EM', 'H2', 'H3', 'I', 'INPUT', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'U', 'UL'])

function accountStorageKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`
}

function readStorage(key = STORAGE_KEY): { data: PersistedData; error: string } {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { data: initialData, error: '' }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') throw new Error('Stored notes have an invalid format.')
    const value = parsed as Partial<PersistedData>
    const storedLocation = value.location && typeof value.location === 'object' ? value.location : undefined
    const sections: Section[] = ['home', 'all', 'favorites', 'pinned', 'archived', 'trash', 'settings', 'folder']
    return {
      data: {
        notes: Array.isArray(value.notes) ? value.notes : [],
        folders: Array.isArray(value.folders) ? value.folders : [],
        settings: { ...defaultSettings, ...(value.settings ?? {}) },
        displayName: typeof value.displayName === 'string' ? value.displayName.trim().slice(0, 60) : '',
        location: storedLocation ? {
          section: sections.includes(storedLocation.section) ? storedLocation.section : 'home',
          activeFolderId: typeof storedLocation.activeFolderId === 'string' ? storedLocation.activeFolderId : '',
          activeNoteId: typeof storedLocation.activeNoteId === 'string' ? storedLocation.activeNoteId : null,
          query: typeof storedLocation.query === 'string' ? storedLocation.query : '',
        } : undefined,
      },
      error: '',
    }
  } catch {
    return { data: initialData, error: 'Your saved notes could not be read. Browser storage may be unavailable or damaged.' }
  }
}

function validWorkspace(value: unknown): value is PersistedData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Partial<PersistedData>
  const settings = data.settings
  return Array.isArray(data.notes) && Array.isArray(data.folders)
    && Boolean(settings && typeof settings === 'object'
      && (settings.theme === 'light' || settings.theme === 'dark')
      && typeof settings.fontSize === 'number'
      && (settings.view === 'grid' || settings.view === 'list')
      && ['edited', 'created', 'alphabetical', 'oldest'].includes(settings.sort))
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  if (!response.ok) {
    let message = `Request failed (${response.status}).`
    let code: string | undefined
    try {
      const body = await response.json() as { error?: string; code?: string }
      if (body.error) message = body.error
      code = body.code
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    throw Object.assign(new Error(message), { status: response.status, code }) satisfies ApiError
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function cleanHTML(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const visit = (node: Element) => {
    for (const child of [...node.children]) {
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent ?? ''))
        continue
      }
      for (const attribute of [...child.attributes]) {
        const keep = child.tagName === 'INPUT' && ['type', 'checked', 'disabled'].includes(attribute.name)
        if (!keep) child.removeAttribute(attribute.name)
      }
      if (child.tagName === 'INPUT') {
        child.setAttribute('type', 'checkbox')
        child.setAttribute('contenteditable', 'false')
      }
      visit(child)
    }
  }
  visit(parsed.body)
  return parsed.body.innerHTML
}

function textFromHTML(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function App() {
  const [stored] = useState(readStorage)
  const [notes, setNotes] = useState<Note[]>(stored.data.notes)
  const [folders, setFolders] = useState<NoteFolder[]>(stored.data.folders)
  const [settings, setSettings] = useState<SettingsState>(stored.data.settings)
  const [displayName, setDisplayName] = useState(stored.data.displayName ?? '')
  const [greeting] = useState(() => {
    const hour = new Date().getHours()
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  })
  const [nameInput, setNameInput] = useState('')
  const [storageError, setStorageError] = useState(stored.error)
  const [section, setSection] = useState<Section>(stored.data.location?.section ?? 'home')
  const [activeFolderId, setActiveFolderId] = useState(stored.data.location?.activeFolderId ?? '')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(stored.data.location?.activeNoteId ?? null)
  const [query, setQuery] = useState(stored.data.location?.query ?? '')
  const [notice, setNotice] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [authDialog, setAuthDialog] = useState<'signin' | 'signup' | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [staySignedIn, setStaySignedIn] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authInfo, setAuthInfo] = useState('')
  const [verificationPending, setVerificationPending] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const lastLoadedNote = useRef<string | null>(null)
  const selectionRange = useRef<Range | null>(null)
  const syncTimer = useRef<number | undefined>(undefined)
  const syncPending = useRef<PersistedData | null>(null)
  const syncInFlight = useRef(false)

  function applyWorkspace(workspace: PersistedData) {
    setNotes(workspace.notes)
    setFolders(workspace.folders)
    setSettings({ ...defaultSettings, ...workspace.settings })
    setDisplayName(workspace.displayName ?? '')
    setSection(workspace.location?.section ?? 'home')
    setActiveFolderId(workspace.location?.activeFolderId ?? '')
    setActiveNoteId(workspace.location?.activeNoteId ?? null)
    setQuery(workspace.location?.query ?? '')
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authDialog || authBusy) return
    setAuthBusy(true)
    setAuthError('')
    setAuthInfo('')
    setVerificationPending(false)
    try {
      if (authDialog === 'signup') {
        const result = await apiRequest<{ user: User }>('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword, staySignedIn }),
        })
        setUser(result.user)
        setCloudReady(false)
        setAuthDialog(null)
        setAuthPassword('')
        setAuthInfo('Account created. Verify your email to turn on sync across devices.')
        setStorageError('Verify your email address to enable account sync. Your notes are still saved on this device.')
      } else {
        setReady(false)
        const result = await apiRequest<{ user: User }>('/api/auth/signin', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword, staySignedIn }),
        })
        const { workspace } = await apiRequest<{ workspace: unknown | null }>('/api/workspace')
        let savedWorkspace: PersistedData
        if (workspace === null) {
          const local = readStorage()
          savedWorkspace = {
            ...local.data,
            location: local.data.location ?? { section: 'home', activeFolderId: '', activeNoteId: null },
          }
          await apiRequest('/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace: savedWorkspace }) })
        } else if (validWorkspace(workspace)) {
          savedWorkspace = workspace
        } else {
          throw new Error('Your account workspace could not be read because its saved data is invalid.')
        }
        applyWorkspace(savedWorkspace)
        setUser(result.user)
        setCloudReady(true)
        setSyncStatus('saved')
        setStorageError('')
        setAuthDialog(null)
        setAuthPassword('')
        setNotice('Your workspace has been restored')
      }
    } catch (error) {
      setReady(true)
      if (error instanceof Error && (error as ApiError).code === 'EMAIL_UNVERIFIED') setVerificationPending(true)
      setAuthError(error instanceof Error ? error.message : 'Your account request could not be completed.')
    } finally {
      setAuthBusy(false)
    }
  }

  function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nameInput.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!name) return
    setDisplayName(name)
    setNameInput('')
  }

  async function resendVerification(email = user?.email) {
    if (!email) return
    setAuthError('')
    setAuthInfo('')
    try {
      const result = await apiRequest<{ message: string }>('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setAuthInfo(result.message)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'The verification email could not be resent.')
    }
  }

  async function signOut() {
    setAuthError('')
    try {
      await apiRequest('/api/auth/signout', { method: 'POST' })
      const local = readStorage()
      setUser(null)
      setCloudReady(true)
      setNotes(local.data.notes)
      setFolders(local.data.folders)
      setSettings(local.data.settings)
      setDisplayName(local.data.displayName ?? '')
      setSection(local.data.location?.section ?? 'home')
      setActiveFolderId(local.data.location?.activeFolderId ?? '')
      setActiveNoteId(local.data.location?.activeNoteId ?? null)
      setQuery(local.data.location?.query ?? '')
      setStorageError(local.error)
      setNotice('Signed out. Your account workspace remains saved online.')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'You could not be signed out.')
    }
  }

  function retrySync() {
    if (!user?.verifiedAt) return
    syncPending.current = {
      notes, folders, settings, displayName,
      location: { section, activeFolderId, activeNoteId, query },
    }
    void flushRemoteSync()
  }

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? null
  const activeFolder = folders.find((folder) => folder.id === activeFolderId)

  const createNote = useCallback(() => {
    const now = new Date().toISOString()
    const note: Note = {
      id: makeId(), title: '', content: '', folderId: section === 'folder' ? activeFolderId : null,
      favorite: false, pinned: false, archived: false, deletedAt: null, createdAt: now, updatedAt: now,
    }
    setNotes((current) => [note, ...current])
    setActiveNoteId(note.id)
  }, [activeFolderId, section])

  const flushRemoteSync = useCallback(async () => {
    if (syncInFlight.current || !syncPending.current) return
    const pending = syncPending.current
    syncPending.current = null
    syncInFlight.current = true
    setSyncStatus('saving')
    try {
      await apiRequest('/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace: pending }) })
      setSyncStatus('saved')
    } catch (error) {
      setSyncStatus('error')
      setStorageError(`Your changes are saved on this device, but account sync failed: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      syncInFlight.current = false
      if (syncPending.current) {
        syncTimer.current = window.setTimeout(() => { void flushRemoteSync() }, 250)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function restoreAccount() {
      try {
        if (window.location.pathname === '/dashboard') window.history.replaceState({}, '', '/')
        const verificationToken = new URLSearchParams(window.location.search).get('verify')
        if (verificationToken) {
          await apiRequest('/api/auth/verify', {
            method: 'POST',
            body: JSON.stringify({ token: verificationToken }),
          })
          window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
          setAuthInfo('Your email is verified. Your workspace is ready to sync.')
        }
        const { user: account } = await apiRequest<{ user: User }>('/api/me')
        if (cancelled) return
        setUser(account)
        if (account.verifiedAt) {
          const { workspace } = await apiRequest<{ workspace: unknown | null }>('/api/workspace')
          if (cancelled) return
          const local = readStorage()
          if (workspace === null) {
            const migration = { ...local.data, location: local.data.location ?? { section: 'home', activeFolderId: '', activeNoteId: null } }
            await apiRequest('/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace: migration }) })
            setNotes(migration.notes)
            setFolders(migration.folders)
            setSettings(migration.settings)
            setDisplayName(migration.displayName ?? '')
            setSection(migration.location.section)
            setActiveFolderId(migration.location.activeFolderId)
            setActiveNoteId(migration.location.activeNoteId)
            setQuery(migration.location.query ?? '')
          } else if (validWorkspace(workspace)) {
            setNotes(workspace.notes)
            setFolders(workspace.folders)
            setSettings({ ...defaultSettings, ...workspace.settings })
            setDisplayName(workspace.displayName ?? '')
            setSection(workspace.location?.section ?? 'home')
            setActiveFolderId(workspace.location?.activeFolderId ?? '')
            setActiveNoteId(workspace.location?.activeNoteId ?? null)
            setQuery(workspace.location?.query ?? '')
          } else {
            setStorageError('Your account workspace could not be read because its saved data is invalid.')
          }
          setCloudReady(validWorkspace(workspace) || workspace === null)
        } else {
          setStorageError('Verify your email address to enable account sync. Your notes are still saved on this device.')
        }
      } catch (error) {
        if (cancelled) return
        const apiError = error instanceof Error ? error as ApiError : null
        if (apiError?.status !== 401) {
          setStorageError(`Account sync is unavailable: ${error instanceof Error ? error.message : 'Please try again.'} Your notes are still saved on this device.`)
        }
        if (!apiError?.status || apiError.status === 401) setCloudReady(true)
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void restoreAccount()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready) return
    let timer: number | undefined
    const data: PersistedData = {
      notes, folders, settings, displayName,
      location: { section, activeFolderId, activeNoteId, query },
    }
    try {
      localStorage.setItem(user ? accountStorageKey(user.id) : STORAGE_KEY, JSON.stringify(data))
      if (!user && storageError && !storageError.startsWith('Account sync is unavailable:')) {
        timer = window.setTimeout(() => setStorageError(''), 0)
      }
    } catch {
      timer = window.setTimeout(() => {
        setStorageError('Your changes could not be saved to this browser. Check available storage space and try again.')
      }, 0)
    }
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [activeFolderId, activeNoteId, displayName, folders, notes, query, ready, section, settings, storageError, user])

  useEffect(() => {
    if (!ready || !cloudReady || !user?.verifiedAt) return
    syncPending.current = {
      notes, folders, settings, displayName,
      location: { section, activeFolderId, activeNoteId, query },
    }
    if (syncTimer.current !== undefined) window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => { void flushRemoteSync() }, 500)
    return () => {
      if (syncTimer.current !== undefined) window.clearTimeout(syncTimer.current)
    }
  }, [activeFolderId, activeNoteId, cloudReady, displayName, flushRemoteSync, folders, notes, query, ready, section, settings, user])

  useEffect(() => {
    if (activeNote && lastLoadedNote.current !== activeNote.id && editorRef.current) {
      editorRef.current.innerHTML = cleanHTML(activeNote.content)
      lastLoadedNote.current = activeNote.id
      selectionRange.current = null
    }
    if (!activeNote) lastLoadedNote.current = null
  }, [activeNote])

  useEffect(() => {
    if (activeNoteId) titleRef.current?.focus()
  }, [activeNoteId])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        createNote()
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!activeNote) searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [activeNote, createNote])

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    let result = notes.filter((note) => {
      if (section === 'trash') return Boolean(note.deletedAt)
      if (note.deletedAt) return false
      if (section === 'archived') return note.archived
      if (note.archived) return false
      if (section === 'favorites' && !note.favorite) return false
      if (section === 'pinned' && !note.pinned) return false
      if (section === 'folder' && note.folderId !== activeFolderId) return false
      return true
    })
    if (normalizedQuery) {
      result = result.filter((note) => `${note.title} ${textFromHTML(note.content)}`.toLocaleLowerCase().includes(normalizedQuery))
    }
    result.sort((a, b) => {
      if (a.pinned !== b.pinned && section !== 'trash') return a.pinned ? -1 : 1
      if (settings.sort === 'alphabetical') return (a.title || 'Untitled').localeCompare(b.title || 'Untitled')
      if (settings.sort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (settings.sort === 'oldest') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return result
  }, [activeFolderId, notes, query, section, settings.sort])

  const activeTitle = section === 'folder' ? activeFolder?.name ?? 'Folder' : ({
    home: 'Home', all: 'All Notes', favorites: 'Favourites', pinned: 'Pinned', archived: 'Archived', trash: 'Recently Deleted', settings: 'Settings',
  } satisfies Record<Exclude<Section, 'folder'>, string>)[section]

  function updateNote(id: string, updates: Partial<Note>) {
    setNotes((current) => current.map((note) => note.id === id ? { ...note, ...updates, updatedAt: new Date().toISOString() } : note))
  }

  function saveContent() {
    if (!activeNote || !editorRef.current) return
    updateNote(activeNote.id, { content: cleanHTML(editorRef.current.innerHTML) })
  }

  function rememberEditorSelection() {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (editor && selection?.rangeCount && editor.contains(selection.anchorNode)) {
      selectionRange.current = selection.getRangeAt(0).cloneRange()
    }
  }

  function focusEditorSelection() {
    const editor = editorRef.current
    editor?.focus()
    const range = selectionRange.current
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function runFormat(command: string, value?: string) {
    focusEditorSelection()
    document.execCommand(command, false, value)
    rememberEditorSelection()
    saveContent()
  }

  function addChecklist() {
    focusEditorSelection()
    document.execCommand('insertHTML', false, '<ul><li><input type="checkbox" contenteditable="false"> <span>New task</span></li></ul>')
    rememberEditorSelection()
    saveContent()
  }

  function navigate(next: Section, folderId = '') {
    setSection(next)
    setActiveFolderId(folderId)
    setActiveNoteId(null)
    setQuery('')
  }

  function createFolder() {
    setFolderDialog({ mode: 'create', name: '' })
  }

  function renameFolder(folder: NoteFolder) {
    setFolderDialog({ mode: 'rename', folderId: folder.id, name: folder.name })
  }

  function removeFolder(folder: NoteFolder) {
    setPendingAction({ type: 'deleteFolder', folderId: folder.id })
  }

  function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!folderDialog || !folderDialog.name.trim()) return
    const name = folderDialog.name.trim()
    if (folderDialog.mode === 'create') {
      const folder = { id: makeId(), name }
      setFolders((current) => [...current, folder])
      navigate('folder', folder.id)
    } else {
      setFolders((current) => current.map((folder) => folder.id === folderDialog.folderId ? { ...folder, name } : folder))
    }
    setFolderDialog(null)
  }

  function confirmPendingAction() {
    if (!pendingAction) return
    if (pendingAction.type === 'deleteFolder') {
      const { folderId } = pendingAction
      setFolders((current) => current.filter((folder) => folder.id !== folderId))
      setNotes((current) => current.map((note) => note.folderId === folderId ? { ...note, folderId: null } : note))
      if (activeFolderId === folderId) navigate('all')
      setNotice('Folder deleted; its notes were moved to All Notes')
    } else {
      setNotes((current) => current.filter((note) => note.id !== pendingAction.noteId))
      setNotice('Note permanently deleted')
    }
    setPendingAction(null)
  }

  function moveToTrash(note: Note) {
    updateNote(note.id, { deletedAt: new Date().toISOString() })
    if (activeNoteId === note.id) setActiveNoteId(null)
    setNotice('Moved to Recently Deleted')
  }

  function restoreNote(note: Note) {
    updateNote(note.id, { deletedAt: null })
    setNotice('Note restored')
  }

  function permanentlyDelete(note: Note) {
    setPendingAction({ type: 'permanentlyDelete', noteId: note.id })
  }

  function exportNotes() {
    const exportable = notes.filter((note) => !note.deletedAt)
    if (!exportable.length) {
      setNotice('There are no notes to export yet')
      return
    }
    const output = exportable.map((note) => [
      note.title || 'Untitled',
      `Created: ${new Date(note.createdAt).toLocaleString()}`,
      `Last edited: ${new Date(note.updatedAt).toLocaleString()}`,
      note.folderId ? `Folder: ${folders.find((folder) => folder.id === note.folderId)?.name ?? ''}` : '',
      '',
      textFromHTML(note.content),
    ].filter((line) => line !== undefined).join('\n')).join('\n\n------------------------------\n\n')
    const url = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `QuickNotes-export-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`${exportable.length} note${exportable.length === 1 ? '' : 's'} exported`)
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    try {
      const imported = await Promise.all(files.map(async (file) => {
        if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
          throw new Error(`${file.name} is not a plain text (.txt) file.`)
        }
        const now = new Date().toISOString()
        const text = await file.text()
        return {
          id: makeId(), title: file.name.replace(/\.txt$/i, '') || 'Imported note',
          content: `<p>${text.split(/\r?\n/).map((line) => line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')).join('<br>')}</p>`,
          folderId: null, favorite: false, pinned: false, archived: false, deletedAt: null, createdAt: now, updatedAt: now,
        } satisfies Note
      }))
      setNotes((current) => [...imported, ...current])
      setNotice(`${imported.length} note${imported.length === 1 ? '' : 's'} imported`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The selected files could not be imported.')
    } finally {
      event.target.value = ''
    }
  }

  function clearAllNotes() {
    setNotes([])
    setActiveNoteId(null)
    setConfirmClear(false)
    setNotice('All notes cleared')
  }

  function duplicateNote(note: Note) {
    const now = new Date().toISOString()
    const duplicate: Note = {
      ...note,
      id: makeId(),
      title: note.title ? `${note.title} copy` : 'Untitled copy',
      favorite: false,
      pinned: false,
      archived: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    setNotes((current) => [duplicate, ...current])
    setActiveNoteId(duplicate.id)
    setNotice('Note duplicated')
  }

  function renderNoteCard(note: Note) {
    return (
      <article className={`note-card ${settings.view === 'list' ? 'note-list-card' : ''}`} key={note.id}>
        <button className="note-card-open" onClick={() => setActiveNoteId(note.id)} aria-label={`Open ${note.title || 'Untitled note'}`}>
          <div className="note-card-title-row">
            <h3>{note.title || 'Untitled'}</h3>
            <span className="note-card-flags">
              {note.pinned && <Pin size={14} fill="currentColor" aria-label="Pinned" />}
              {note.favorite && <Heart size={14} fill="currentColor" aria-label="Favourite" />}
            </span>
          </div>
          <p className="note-preview">{textFromHTML(note.content) || 'No additional text'}</p>
        </button>
        {note.deletedAt ? (
          <div className="note-card-footer trash-footer">
            <span>{dateLabel(note.deletedAt)}</span>
            <button className="quiet-action" onClick={() => restoreNote(note)} aria-label="Restore note"><Undo2 size={15} /> Restore</button>
            <button className="round-action danger-action" onClick={() => permanentlyDelete(note)} aria-label="Permanently delete note"><Trash2 size={15} /></button>
          </div>
        ) : (
          <div className="note-card-footer">
            <span>{note.folderId ? folders.find((folder) => folder.id === note.folderId)?.name : dateLabel(note.updatedAt)}</span>
            <div className="card-actions">
              <button className="round-action" onClick={() => duplicateNote(note)} aria-label="Duplicate note"><Copy size={15} /></button>
              <button className={`round-action ${note.favorite ? 'selected-action' : ''}`} onClick={() => updateNote(note.id, { favorite: !note.favorite })} aria-label={note.favorite ? 'Remove favourite' : 'Add to favourites'}><Heart size={15} fill={note.favorite ? 'currentColor' : 'none'} /></button>
              <button className={`round-action ${note.pinned ? 'selected-action' : ''}`} onClick={() => updateNote(note.id, { pinned: !note.pinned })} aria-label={note.pinned ? 'Unpin note' : 'Pin note'}><Pin size={15} fill={note.pinned ? 'currentColor' : 'none'} /></button>
              <button className="round-action" onClick={() => moveToTrash(note)} aria-label="Move note to Recently Deleted"><Trash2 size={15} /></button>
            </div>
          </div>
        )}
      </article>
    )
  }

  function renderSettings() {
    return (
      <section className="settings-page">
        <div className="settings-intro"><span className="section-kicker">MAKE IT YOURS</span><h1>Settings</h1><p>Your preferences and your notes, just the way you like them.</p></div>
        <section className="settings-card">
          <div className="settings-card-heading"><div className="settings-icon"><LogIn size={18} /></div><div><h2>Account & sync</h2><p>Keep your notes, folders, and preferences available when you return.</p></div></div>
          {user ? (
            <>
              <div className="setting-row"><div><strong>{user.email}</strong><span>{user.verifiedAt ? syncStatus === 'saving' ? 'Syncing your workspace…' : syncStatus === 'error' ? 'Sync needs attention.' : 'Your workspace syncs automatically.' : 'Verify your email address to enable account sync.'}</span></div><div className="account-actions">{!user.verifiedAt && <button className="secondary-button" onClick={() => void resendVerification()}>Resend verification</button>}{syncStatus === 'error' && <button className="secondary-button" onClick={retrySync}>Retry sync</button>}<button className="secondary-button" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button></div></div>
              {authError && <p className="account-message account-error" role="alert">{authError}</p>}
              {authInfo && <p className="account-message" role="status">{authInfo}</p>}
            </>
          ) : (
            <>
              <div className="setting-row"><div><strong>Using this device only</strong><span>Create an account or sign in to restore your work across devices.</span></div><div className="account-actions"><button className="secondary-button" onClick={() => { setAuthError(''); setAuthDialog('signin') }}>Sign in</button><button className="save-button" onClick={() => { setAuthError(''); setAuthDialog('signup') }}>Create account</button></div></div>
              {authError && <p className="account-message account-error" role="alert">{authError}</p>}
              {authInfo && <p className="account-message" role="status">{authInfo}</p>}
            </>
          )}
        </section>
        <section className="settings-card">
          <div className="settings-card-heading"><div className="settings-icon"><Sun size={18} /></div><div><h2>Appearance</h2><p>Choose the look and feel of your workspace.</p></div></div>
          <div className="setting-row"><div><strong>Theme</strong><span>Switch between light and dark mode</span></div><div className="segmented-control"><button className={settings.theme === 'light' ? 'is-selected' : ''} onClick={() => setSettings((value) => ({ ...value, theme: 'light' }))}><Sun size={15} /> Light</button><button className={settings.theme === 'dark' ? 'is-selected' : ''} onClick={() => setSettings((value) => ({ ...value, theme: 'dark' }))}><Moon size={15} /> Dark</button></div></div>
          <div className="setting-row"><div><strong>Editor text size</strong><span>Adjust how text appears while writing</span></div><select value={settings.fontSize} onChange={(event) => setSettings((value) => ({ ...value, fontSize: Number(event.target.value) }))}><option value={14}>Small</option><option value={16}>Medium</option><option value={18}>Large</option><option value={20}>Extra large</option></select></div>
          <div className="setting-row"><div><strong>Default note layout</strong><span>Choose how your notes are displayed</span></div><div className="segmented-control"><button className={settings.view === 'grid' ? 'is-selected' : ''} onClick={() => setSettings((value) => ({ ...value, view: 'grid' }))}><LayoutGrid size={15} /> Grid</button><button className={settings.view === 'list' ? 'is-selected' : ''} onClick={() => setSettings((value) => ({ ...value, view: 'list' }))}><List size={15} /> List</button></div></div>
        </section>
        <section className="settings-card">
          <div className="settings-card-heading"><div className="settings-icon"><FileText size={18} /></div><div><h2>Your notes</h2><p>Take your notes with you or bring them in.</p></div></div>
          <div className="setting-row"><div><strong>Export notes</strong><span>Download all saved notes as a .txt file</span></div><button className="secondary-button" onClick={exportNotes}>Export TXT</button></div>
          <div className="setting-row"><div><strong>Import text files</strong><span>Each .txt file becomes a new note</span></div><button className="secondary-button" onClick={() => importRef.current?.click()}>Import TXT</button></div>
        </section>
        <section className="settings-card danger-settings">
          <div className="settings-card-heading"><div className="settings-icon"><Trash2 size={18} /></div><div><h2>Clear all notes</h2><p>Permanently remove every note, including items in Recently Deleted.</p></div></div>
          <div className="setting-row"><div><strong>This cannot be undone</strong><span>Folders and preferences will remain in place.</span></div><button className="danger-button" onClick={() => setConfirmClear(true)}>Clear all notes</button></div>
        </section>
      </section>
    )
  }

  function renderEditor() {
    if (!activeNote) return null
    return (
      <section className="editor-page">
        <div className="editor-topline">
          <button className="back-button" onClick={() => setActiveNoteId(null)}><X size={17} /> Close</button>
          <span className="save-status"><Check size={14} /> {user?.verifiedAt ? syncStatus === 'saving' ? 'Syncing…' : syncStatus === 'error' ? 'Sync needs attention' : 'Saved to your account' : 'Saved on this device'}</span>
          <div className="editor-top-actions">
            <button className="editor-icon-button" onClick={() => duplicateNote(activeNote)} aria-label="Duplicate note"><Copy size={17} /></button>
            <button className="editor-icon-button" onClick={() => updateNote(activeNote.id, { favorite: !activeNote.favorite })} aria-label={activeNote.favorite ? 'Remove favourite' : 'Add to favourites'}><Heart size={17} fill={activeNote.favorite ? 'currentColor' : 'none'} /></button>
            <button className="editor-icon-button" onClick={() => updateNote(activeNote.id, { pinned: !activeNote.pinned })} aria-label={activeNote.pinned ? 'Unpin note' : 'Pin note'}><Pin size={17} fill={activeNote.pinned ? 'currentColor' : 'none'} /></button>
            <button className="editor-icon-button" onClick={() => updateNote(activeNote.id, { archived: !activeNote.archived })} aria-label={activeNote.archived ? 'Unarchive note' : 'Archive note'}><Archive size={17} /></button>
            <button className="editor-icon-button danger-action" onClick={() => moveToTrash(activeNote)} aria-label="Delete note"><Trash2 size={17} /></button>
            <button className="save-button" onClick={() => { saveContent(); setNotice(user?.verifiedAt ? 'Note saved and syncing to your account' : 'Note saved on this device') }}><Check size={15} /> Save</button>
          </div>
        </div>
        <div className="editor-paper">
          <div className="note-metadata"><span>CREATED {dateLabel(activeNote.createdAt)}</span><span>EDITED {dateLabel(activeNote.updatedAt)}</span></div>
          <input ref={titleRef} className="note-title-input" aria-label="Note title" placeholder="Untitled note" value={activeNote.title} onChange={(event) => updateNote(activeNote.id, { title: event.target.value })} />
          <div className="editor-toolbar" role="toolbar" aria-label="Text formatting" onMouseDown={(event) => event.preventDefault()}>
            <button title="Heading" aria-label="Heading" onClick={() => runFormat('formatBlock', 'h2')}>H</button>
            <span className="toolbar-divider" />
            <button title="Bold" aria-label="Bold" onClick={() => runFormat('bold')}><strong>B</strong></button>
            <button title="Italic" aria-label="Italic" onClick={() => runFormat('italic')}><em>I</em></button>
            <span className="toolbar-divider" />
            <button title="Bulleted list" aria-label="Bulleted list" onClick={() => runFormat('insertUnorderedList')}><List size={17} /></button>
            <button title="Numbered list" aria-label="Numbered list" onClick={() => runFormat('insertOrderedList')}><ArrowUpDown size={16} /></button>
            <button title="Insert checklist" aria-label="Insert checklist" onClick={addChecklist}><ListChecks size={17} /></button>
          </div>
          <div
            ref={editorRef}
            className="note-body-editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Note content"
            aria-multiline="true"
            data-placeholder="Start writing your thoughts..."
            style={{ '--editor-font-size': `${settings.fontSize}px` } as CSSProperties}
            onInput={() => { rememberEditorSelection(); saveContent() }}
            onKeyUp={rememberEditorSelection}
            onMouseUp={rememberEditorSelection}
            onClick={(event) => {
              if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
                event.target.toggleAttribute('checked', event.target.checked)
                saveContent()
              }
            }}
          />
          <div className="editor-bottom">
            <label className="move-note-label"><Folder size={15} /> Move to
              <select aria-label="Move note to folder" value={activeNote.folderId ?? ''} onChange={(event) => updateNote(activeNote.id, { folderId: event.target.value || null })}>
                <option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select><ChevronDown size={13} />
            </label>
            <span>{textFromHTML(activeNote.content).trim().split(/\s+/).filter(Boolean).length} words</span>
          </div>
        </div>
      </section>
    )
  }

  const isTrash = section === 'trash'
  const noNotesMessage = query ? `No notes found for “${query}”.` : isTrash ? 'Deleted notes will stay here until you restore or permanently delete them.' : section === 'favorites' ? 'Favourite a note to keep it close at hand.' : section === 'pinned' ? 'Pin important notes and they will show up here.' : section === 'archived' ? 'Archived notes will be kept here until you restore them.' : 'Create your first note and let the ideas flow.'

  if (!ready) {
    return <div className="workspace-loading" role="status">Restoring your workspace…</div>
  }

  if (!displayName) {
    return (
      <main className="welcome-screen">
        <form className="welcome-card" onSubmit={saveDisplayName}>
          <span className="welcome-brand"><span className="brand-mark"><CheckCheck size={18} /></span> Quick<span>Notes</span></span>
          <span className="section-kicker">A LITTLE SPACE FOR YOU</span>
          <h1>What should we call you?</h1>
          <p>Make this workspace feel like yours. Your name is saved on this device.</p>
          <label className="dialog-field-label" htmlFor="welcome-name">Your name</label>
          <input
            id="welcome-name"
            className="dialog-text-input welcome-name-input"
            autoFocus
            autoComplete="given-name"
            maxLength={60}
            required
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Enter your name"
          />
          <button type="submit" className="welcome-continue">Continue</button>
        </form>
      </main>
    )
  }

  return (
    <div className={`workspace ${settings.theme === 'dark' ? 'theme-dark' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('home')} aria-label="QuickNotes home"><span className="brand-mark"><CheckCheck size={18} /></span><span>Quick<span>Notes</span></span></button>
        <button className="create-note-button" onClick={createNote}><Plus size={18} strokeWidth={2.2} /> Create Note <span>⌘ N</span></button>
        <div className="sidebar-scroll">
          <span className="nav-caption">WORKSPACE</span>
          <nav className="main-nav" aria-label="Main navigation">
            <button className={section === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('home')}><Home size={17} /> Home</button>
            <button className={section === 'all' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('all')}><FileText size={17} /> All Notes <span className="nav-count">{notes.filter((note) => !note.deletedAt && !note.archived).length}</span></button>
            <button className={section === 'favorites' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('favorites')}><Heart size={17} /> Favourites</button>
            <button className={section === 'pinned' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('pinned')}><Pin size={17} /> Pinned</button>
            <button className={section === 'archived' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('archived')}><Archive size={17} /> Archived</button>
            <button className={section === 'trash' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('trash')}><Trash2 size={17} /> Recently Deleted <span className="nav-count">{notes.filter((note) => note.deletedAt).length}</span></button>
          </nav>
          <div className="folder-heading"><span className="nav-caption">FOLDERS</span><button className="small-icon-button" onClick={createFolder} aria-label="Create folder" title="Create folder"><FolderPlus size={17} /></button></div>
          <div className="folder-list">
            {folders.map((folder) => (
              <div className={`folder-nav-row ${section === 'folder' && activeFolderId === folder.id ? 'active-folder' : ''}`} key={folder.id}>
                <button className="folder-nav-item" onClick={() => navigate('folder', folder.id)}><Folder size={16} /> <span>{folder.name}</span></button>
                <details className="folder-menu"><summary aria-label={`Folder options for ${folder.name}`}><MoreHorizontal size={16} /></summary><div className="folder-menu-popover"><button onClick={() => renameFolder(folder)}>Rename</button><button onClick={() => removeFolder(folder)}>Delete folder</button></div></details>
              </div>
            ))}
            {!folders.length && <p className="empty-folders">Your folders will appear here</p>}
          </div>
        </div>
        <div className="sidebar-bottom">
          <button className="storage-note" onClick={() => user ? navigate('settings') : setAuthDialog('signin')} title={user?.verifiedAt ? `Signed in as ${user.email}` : 'Sign in to sync your workspace'}>
            <span className={`storage-dot ${user?.verifiedAt && syncStatus === 'error' ? 'storage-dot-error' : ''}`} />
            <span>{user ? user.verifiedAt ? syncStatus === 'saving' ? 'Syncing…' : syncStatus === 'error' ? 'Sync needs attention' : user.email : 'Verify email to sync' : 'Saved on this device · Sign in to sync'}</span>
          </button>
          <button className={section === 'settings' ? 'nav-item settings-link active' : 'nav-item settings-link'} onClick={() => navigate('settings')}><Settings size={17} /> Settings</button>
          <span className="sidebar-version">QuickNotes · Your thoughts, in order.</span>
        </div>
      </aside>

      <main className="main-panel">
        {!activeNote && <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{activeTitle}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={17} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your notes..." aria-label="Search notes" />{query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}<kbd>⌘ K</kbd></label>
            <button className="top-create-button" onClick={createNote}><Plus size={17} /> New note</button>
          </div>
        </header>}

        {activeNote ? renderEditor() : section === 'settings' ? renderSettings() : (
          <div className="notes-page">
            <div className="page-heading">
              <div><span className="section-kicker">{section === 'home' ? 'YOUR PERSONAL SPACE' : isTrash ? 'RECENTLY DELETED' : 'YOUR COLLECTION'}</span><h1>{query ? 'Search results' : section === 'home' ? `${greeting}, ${displayName}!` : activeTitle}</h1><p>{query ? `Showing notes matching “${query}”` : section === 'home' ? 'A little space for all the things on your mind.' : section === 'all' ? 'Everything you have written, all in one place.' : isTrash ? 'Restore a note or remove it forever.' : section === 'archived' ? 'Notes you’ve tucked away for later.' : 'Find exactly what you’re looking for.'}</p></div>
              <div className="page-heading-actions">
                {(section === 'folder') && activeFolder && <button className="folder-edit-button" onClick={() => renameFolder(activeFolder)}>Rename folder</button>}
                {!isTrash && <button className="new-note-heading-button" onClick={createNote}><Plus size={17} /> Create Note</button>}
              </div>
            </div>

            {section === 'home' && !query && (
              <section className="recent-section">
                <div className="section-heading"><div><Clock3 size={16} /><h2>Recently edited</h2></div><button onClick={() => { setSettings((value) => ({ ...value, sort: 'edited' })); navigate('all') }}>See all</button></div>
                {notes.filter((note) => !note.deletedAt && !note.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3).length > 0
                  ? <div className="recent-strip">{notes.filter((note) => !note.deletedAt && !note.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3).map((note) => <button className="recent-note" key={note.id} onClick={() => setActiveNoteId(note.id)}><span className="recent-note-icon"><FileText size={17} /></span><span className="recent-note-text"><strong>{note.title || 'Untitled'}</strong><small>{dateLabel(note.updatedAt)}</small></span><ChevronDown className="recent-arrow" size={15} /></button>)}</div>
                  : <div className="recent-empty">Your latest notes will show up here.</div>}
              </section>
            )}

            <section className="all-notes-section">
              <div className="notes-toolbar">
                <div className="section-heading"><div><FileText size={16} /><h2>{section === 'home' ? 'All Notes' : activeTitle}</h2><span className="result-count">{visibleNotes.length}</span></div></div>
                <div className="list-controls">
                  <label className="sort-select"><ArrowDownAZ size={15} /><select aria-label="Sort notes" value={settings.sort} onChange={(event) => setSettings((value) => ({ ...value, sort: event.target.value as SettingsState['sort'] }))}><option value="edited">Recently edited</option><option value="created">Recently created</option><option value="alphabetical">Alphabetical</option><option value="oldest">Oldest edited</option></select><ChevronDown size={13} /></label>
                  <div className="view-switch" aria-label="Note view"><button className={settings.view === 'grid' ? 'selected' : ''} onClick={() => setSettings((value) => ({ ...value, view: 'grid' }))} aria-label="Grid view"><LayoutGrid size={16} /></button><button className={settings.view === 'list' ? 'selected' : ''} onClick={() => setSettings((value) => ({ ...value, view: 'list' }))} aria-label="List view"><List size={16} /></button></div>
                </div>
              </div>
              {visibleNotes.length ? <div className={`notes-grid ${settings.view === 'list' ? 'notes-list' : ''}`}>{visibleNotes.map(renderNoteCard)}</div> : <div className="empty-state"><span className="empty-icon">{isTrash ? <Trash2 size={23} /> : <FileText size={23} />}</span><h3>{query ? 'Nothing came up' : isTrash ? 'Your trash is empty' : 'It’s a little quiet here'}</h3><p>{noNotesMessage}</p>{!query && !isTrash && <button className="new-note-heading-button" onClick={createNote}><Plus size={16} /> Create your first note</button>}</div>}
            </section>
          </div>
        )}
      </main>
      <input ref={importRef} className="hidden-input" type="file" accept=".txt,text/plain" multiple onChange={(event) => void importFiles(event)} />
      {storageError && <div className="storage-error" role="alert">{storageError}</div>}
      {notice && <div className="toast-message" role="status">{notice}</div>}
      {authDialog && <div className="modal-backdrop" role="presentation"><form className="confirm-dialog auth-dialog" onSubmit={(event) => void submitAuth(event)} role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title"><button type="button" className="modal-close" onClick={() => setAuthDialog(null)} aria-label="Close dialog"><X size={18} /></button><span className="dialog-warning-icon folder-dialog-icon"><LogIn size={20} /></span><h2 id="auth-dialog-title">{authDialog === 'signup' ? 'Create your account' : 'Welcome back'}</h2><p>{authDialog === 'signup' ? 'Save your workspace securely and restore it on any device.' : 'Sign in to restore your saved workspace and preferences.'}</p>{authError && <p className="account-message account-error" role="alert">{authError}</p>}{authInfo && <p className="account-message" role="status">{authInfo}</p>}<label className="dialog-field-label" htmlFor="account-email">Email address</label><input id="account-email" className="dialog-text-input" type="email" autoComplete="email" required maxLength={254} value={authEmail} onChange={(event) => { setAuthEmail(event.target.value); setVerificationPending(false) }} placeholder="you@example.com" /><label className="dialog-field-label" htmlFor="account-password">Password</label><input id="account-password" className="dialog-text-input" type="password" autoComplete={authDialog === 'signup' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 8 characters" />{authDialog === 'signup' && <p className="auth-hint">We’ll send a verification link to your email before enabling sync.</p>}{verificationPending && authDialog === 'signin' && <button type="button" className="secondary-button verification-resend-button" disabled={authBusy} onClick={() => void resendVerification(authEmail)}>Resend verification email</button>}<label className="remember-choice"><input type="checkbox" checked={staySignedIn} onChange={(event) => setStaySignedIn(event.target.checked)} /> Keep me signed in on this device</label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => { setAuthDialog(authDialog === 'signup' ? 'signin' : 'signup'); setAuthError(''); setAuthInfo(''); setVerificationPending(false) }}>{authDialog === 'signup' ? 'I already have an account' : 'Create account'}</button><button type="submit" className="save-button" disabled={authBusy}>{authBusy ? 'Please wait…' : authDialog === 'signup' ? 'Create account' : 'Sign in'}</button></div></form></div>}
      {folderDialog && <div className="modal-backdrop" role="presentation"><form className="confirm-dialog folder-dialog" onSubmit={saveFolder} role="dialog" aria-modal="true" aria-labelledby="folder-dialog-title"><button type="button" className="modal-close" onClick={() => setFolderDialog(null)} aria-label="Close dialog"><X size={18} /></button><span className="dialog-warning-icon folder-dialog-icon"><FolderPlus size={20} /></span><h2 id="folder-dialog-title">{folderDialog.mode === 'create' ? 'Create a folder' : 'Rename folder'}</h2><p>{folderDialog.mode === 'create' ? 'Give your notes a place to belong.' : 'Choose a new name for this folder.'}</p><label className="dialog-field-label" htmlFor="folder-name">Folder name</label><input id="folder-name" className="dialog-text-input" autoFocus maxLength={60} required value={folderDialog.name} onChange={(event) => setFolderDialog({ ...folderDialog, name: event.target.value })} placeholder="e.g. Work, Ideas, Personal" /><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setFolderDialog(null)}>Cancel</button><button type="submit" className="save-button">{folderDialog.mode === 'create' ? 'Create folder' : 'Save name'}</button></div></form></div>}
      {pendingAction && <div className="modal-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="pending-title"><button className="modal-close" onClick={() => setPendingAction(null)} aria-label="Close dialog"><X size={18} /></button><span className="dialog-warning-icon"><Trash2 size={20} /></span><h2 id="pending-title">{pendingAction.type === 'deleteFolder' ? 'Delete this folder?' : 'Permanently delete this note?'}</h2><p>{pendingAction.type === 'deleteFolder' ? 'Notes in this folder will be moved to All Notes.' : 'This note will be removed forever. This action cannot be undone.'}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setPendingAction(null)}>Cancel</button><button className="danger-button" onClick={confirmPendingAction}>{pendingAction.type === 'deleteFolder' ? 'Delete folder' : 'Delete permanently'}</button></div></section></div>}
      {confirmClear && <div className="modal-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-title"><button className="modal-close" onClick={() => setConfirmClear(false)} aria-label="Close dialog"><X size={18} /></button><span className="dialog-warning-icon"><Trash2 size={20} /></span><h2 id="clear-title">Clear all notes?</h2><p>This permanently deletes all your notes, including deleted notes. This action cannot be undone.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setConfirmClear(false)}>Cancel</button><button className="danger-button" onClick={clearAllNotes}>Yes, clear all notes</button></div></section></div>}
    </div>
  )
}

export default App
