'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'

/**
 * Privacy controls (R6):
 * - Viewing-history tracking toggle (server-verified).
 * - Clear viewing history.
 * - Export my data (download).
 * - Delete my account (typed confirmation, then sign out).
 *
 * Uses only the authenticated session for identity; never sends the user's
 * email/id as a body field, and never logs chat/title content.
 */
export function PrivacySettings() {
  const { data: session } = useSession()
  const [trackingEnabled, setTrackingEnabled] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // Load the current preference from the profile.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/user')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setTrackingEnabled(
              data?.preferences?.historyTrackingEnabled !== false
            )
          }
        }
      } catch {
        // Leave default true; non-critical UI read.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const updateTracking = async (enabled: boolean) => {
    setBusy('tracking'); setError(''); setNotice('')
    try {
      const res = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { historyTrackingEnabled: enabled } }),
      })
      if (!res.ok) throw new Error('update-failed')
      setTrackingEnabled(enabled)
      setNotice(
        enabled
          ? 'Viewing-history tracking enabled.'
          : 'Viewing-history tracking disabled. Existing records are kept until you clear them.'
      )
    } catch {
      setError('Could not update the setting. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const clearHistory = async () => {
    setBusy('clear'); setError(''); setNotice('')
    try {
      const res = await fetch('/api/history', { method: 'DELETE' })
      if (!res.ok) throw new Error('clear-failed')
      setNotice('Your viewing history was cleared.')
    } catch {
      setError('Could not clear your viewing history. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const exportData = async () => {
    setBusy('export'); setError(''); setNotice('')
    try {
      const res = await fetch('/api/user/export')
      if (!res.ok) throw new Error('export-failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'movie-data-export.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setNotice('Your data export has been downloaded.')
    } catch {
      setError('Could not generate your data export. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE_MY_ACCOUNT') {
      setError('Type DELETE_MY_ACCOUNT to confirm.')
      return
    }
    setBusy('delete'); setError(''); setNotice('')
    try {
      const res = await fetch('/api/user/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
      })
      if (!res.ok) throw new Error('delete-failed')
      await signOut({ callbackUrl: '/' })
    } catch {
      setError('Could not delete your account. Please try again.')
      setBusy(null)
    }
  }

  return (
    <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Privacy</h2>
        <p className="text-sm text-gray-400">
          Controls for your viewing history, data export, and account. This app
          never deletes your Google account; see the{" "}
          <Link href="/privacy" className="text-cyan-400 hover:text-cyan-300">
            Privacy policy
          </Link>
          .
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 rounded-lg bg-red-950/30 px-3 py-2">{error}</p>
      )}
      {notice && (
        <p className="text-sm text-emerald-400 rounded-lg bg-emerald-950/30 px-3 py-2">{notice}</p>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-gray-200">Viewing-history tracking</p>
          <p className="text-xs text-gray-500">
            When on, titles you view are recorded for the &ldquo;Recently
            Viewed&rdquo; section. Turning it off stops new records but keeps
            existing ones.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-gray-300">{trackingEnabled ? 'On' : 'Off'}</span>
          <input
            type="checkbox"
            checked={trackingEnabled}
            disabled={busy === 'tracking'}
            onChange={(e) => updateTracking(e.target.checked)}
            className="w-5 h-5 rounded accent-cyan-500"
            aria-label="Toggle viewing-history tracking"
          />
        </label>
      </div>

      <div className="border-t border-gray-700/50 pt-5 flex flex-wrap gap-3">
        <button
          onClick={clearHistory}
          disabled={busy !== null}
          className="text-sm rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 text-gray-200 disabled:opacity-50"
        >
          {busy === 'clear' ? 'Clearing…' : 'Clear viewing history'}
        </button>
        <button
          onClick={exportData}
          disabled={busy !== null}
          className="text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy === 'export' ? 'Preparing…' : 'Export my data'}
        </button>
      </div>

      <div className="border-t border-gray-700/50 pt-5">
        <p className="font-medium text-gray-200 mb-2">Delete my account</p>
        <p className="text-xs text-gray-500 mb-3">
          This permanently deletes your account data in this app and signs you
          out. It does not delete your Google account. Requires typing
          DELETE_MY_ACCOUNT.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="privacy-delete-confirm" className="sr-only">
            Type DELETE_MY_ACCOUNT to confirm account deletion
          </label>
          <input
            id="privacy-delete-confirm"
            type="text"
            value={deleteConfirm}
            placeholder="Type DELETE_MY_ACCOUNT"
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="bg-gray-900/60 text-gray-200 border border-gray-700 rounded-lg px-3 py-2 text-sm w-48"
          />
          <button
            onClick={deleteAccount}
            disabled={busy !== null || !session}
            className="text-sm rounded-lg bg-red-700 hover:bg-red-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy === 'delete' ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  )
}
