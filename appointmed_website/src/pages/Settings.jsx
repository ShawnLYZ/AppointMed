import { useCallback, useEffect, useState } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Checkbox from '../components/ui/Checkbox'
import Upload from '../components/ui/Upload'
import EmptyState from '../components/ui/EmptyState'
import PortalLayout from '../components/PortalLayout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { engine } from '../lib/engine'
import './Settings.css'

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const HospitalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 21h18"/>
    <path d="M5 21V7l8-4v18"/>
    <path d="M19 21V11l-6-4"/>
    <path d="M9 9v.01"/>
    <path d="M9 12v.01"/>
    <path d="M9 15v.01"/>
  </svg>
)

// Feather "credit-card" - matches the stroke-icon set already used across the portal
// (Dashboard.jsx, Integration.jsx).
const SubscriptionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
)

// Feather "users" - identical paths to Dashboard.jsx's PeopleIcon (no shared icon
// module between pages yet), reused here for the same concept.
const SpecialistsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const DocumentsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

// Two-letter initials for the avatar circle - real data derived from the real
// full_name, not a fake photo affordance with nothing behind it.
function initials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// hospital.working_hours is free-form jsonb (no shape guaranteed - can be `{}`, can be
// missing individual days). Renders a fixed 7-row grid regardless of what's actually
// present, so a partially-filled record reads as "not set" per day instead of a grid
// that silently shrinks or throws on a missing/malformed entry.
function formatHours(entry) {
  if (!entry) return { text: 'Not set', muted: true }
  if (entry.closed) return { text: 'Closed', muted: true }
  if (entry.open && entry.close) return { text: `${entry.open} - ${entry.close}`, muted: false }
  return { text: 'Not set', muted: true }
}

const PLAN_LABEL = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' }
const SUBSCRIPTION_STATUS_VARIANT = { active: 'success', cancelled: 'error' }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Shared single-slot toast: state + auto-dismiss effect, used identically by
// ProfileSection, SpecialistsSection and DocumentsSection - extracted here instead of
// tripled inline within this file. (The same *shape* still appears, unextracted, in
// Requests.jsx/Integration.jsx - that's a separate, pre-existing cross-file convention
// and is left alone; this is only about the in-file repetition.)
function useToast() {
  const [toast, setToast] = useState(null) // { tone: 'success'|'error', message } | null
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  return [toast, setToast]
}

function ToastBanner({ toast }) {
  if (!toast) return null
  return (
    <div className={`settings__toast settings__toast--${toast.tone}`} role="status">{toast.message}</div>
  )
}

const SECTIONS = [
  { id: 'profile', label: 'Manager Profile', icon: <ProfileIcon /> },
  { id: 'hospital', label: 'Hospital Info', icon: <HospitalIcon /> },
  { id: 'subscription', label: 'Subscription', icon: <SubscriptionIcon /> },
  { id: 'specialists', label: 'Specialists', icon: <SpecialistsIcon /> },
  { id: 'documents', label: 'Documents', icon: <DocumentsIcon /> },
]

const Settings = () => {
  const [activeSection, setActiveSection] = useState('profile')

  const renderSection = () => {
    switch (activeSection) {
      case 'profile': return <ProfileSection />
      case 'hospital': return <HospitalSection />
      case 'subscription': return <SubscriptionSection />
      case 'specialists': return <SpecialistsSection />
      case 'documents': return <DocumentsSection />
      default: return null
    }
  }

  return (
    <PortalLayout active="settings">
      <div className="settings">
        <div className="settings__sidebar">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              className={`settings__sidebar-item ${activeSection === section.id ? 'settings__sidebar-item--active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="settings__sidebar-icon">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </div>

        <div className="settings__content">
          {renderSection()}
        </div>
      </div>
    </PortalLayout>
  )
}

// ── Manager Profile ──────────────────────────────────────────────────────────
// Only full_name/phone are editable - the RLS column grant on profiles permits exactly
// those two (plus passport/avatar_url, neither surfaced here since the brief only asks
// for full_name/phone). Email is real data (profiles.email, set at signup) but rendered
// read-only: it isn't in the update grant, so writing it here would just fail silently
// against RLS - better to not offer the field than to fake it working.
function ProfileSection() {
  const { profile, session, refresh } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useToast()

  const startEditing = () => {
    // Re-seed from the latest profile every time editing starts, so a stale buffer
    // from a previous open (or a refresh that landed while the form was closed) can
    // never clobber a newer value on save.
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setIsEditing(true)
  }

  const save = async () => {
    if (!session) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq('id', session.user.id)
      if (error) throw error
    } catch (err) {
      setSaving(false)
      setToast({ tone: 'error', message: err.message || "Couldn't save your changes. Check your connection and try again." })
      return
    }
    // The write already succeeded from here on - a refresh failure must not be
    // reported as a failed save. It only means our local copy of `profile` is stale
    // until the manager reloads; the database already has the new value.
    setIsEditing(false)
    try {
      await refresh()
      setToast({ tone: 'success', message: 'Profile updated.' })
    } catch {
      setToast({ tone: 'error', message: "Saved, but we couldn't refresh your profile. Reload the page to see it reflected here." })
    } finally {
      setSaving(false)
    }
  }

  if (!profile) {
    return (
      <div className="settings__section">
        <p className="settings__loading">Loading your profile…</p>
      </div>
    )
  }

  return (
    <div className="settings__section">
      <div className="settings__section-header">
        <div>
          <h2 className="settings__section-title">Manager Profile</h2>
          <p className="settings__section-desc">Update your personal information</p>
        </div>
        {!isEditing && (
          <Button variant="secondary" onClick={startEditing}>Edit Profile</Button>
        )}
      </div>

      <div className="settings__avatar-section">
        <div className="settings__avatar">
          <span>{initials(profile.full_name)}</span>
        </div>
      </div>

      <div className="settings__form">
        <Input
          label="Full Name"
          value={isEditing ? fullName : (profile.full_name || '—')}
          onChange={(e) => setFullName(e.target.value)}
          disabled={!isEditing}
          required
        />
        <Input
          label="Phone Number"
          value={isEditing ? phone : (profile.phone || '—')}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!isEditing}
        />
        <Input
          label="Email Address"
          type="email"
          value={profile.email || '—'}
          disabled
          helperText="Contact support to change your email."
        />

        {isEditing && (
          <div className="settings__actions">
            <Button variant="secondary" onClick={() => setIsEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!fullName.trim()}>
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <ToastBanner toast={toast} />
    </div>
  )
}

// ── Hospital Information ─────────────────────────────────────────────────────
// Read-only by design: there's no engine route to update a hospital, and direct
// supabase-js writes to `hospitals` are revoked for authenticated clients by RLS.
function HospitalSection() {
  const { hospital, refresh } = useAuth()
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(null)

  const retry = async () => {
    setRetrying(true)
    setRetryError(null)
    try {
      await refresh()
    } catch (err) {
      setRetryError(err)
    } finally {
      setRetrying(false)
    }
  }

  if (!hospital) {
    return (
      <div className="settings__section">
        <div className="settings__section-header">
          <div>
            <h2 className="settings__section-title">Hospital Information</h2>
            <p className="settings__section-desc">Your hospital&apos;s details, as registered with AppointMed.</p>
          </div>
        </div>
        <Card padding="lg" className="settings__banner settings__banner--error">
          <div className="settings__banner-content">
            <p className="settings__banner-title">Couldn&apos;t load hospital information</p>
            <p className="settings__banner-detail">
              {retryError?.message || 'Please check your connection and try again.'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={retry} loading={retrying}>Retry</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="settings__section">
      <div className="settings__section-header">
        <div>
          <h2 className="settings__section-title">Hospital Information</h2>
          <p className="settings__section-desc">
            Your hospital&apos;s details, as registered with AppointMed. Contact support to change these.
          </p>
        </div>
      </div>

      <div className="settings__form">
        <Input label="Hospital Name" value={hospital.name || '—'} disabled />
        <Input label="Address" value={hospital.address || '—'} disabled />

        <div className="settings__hours">
          <label className="settings__hours-label">Working Hours</label>
          <div className="settings__hours-grid">
            {WEEKDAYS.map((day) => {
              const { text, muted } = formatHours(hospital.working_hours?.[day])
              return (
                <div key={day} className="settings__hours-row">
                  <span className="settings__hours-day">{day.charAt(0).toUpperCase() + day.slice(1, 3)}</span>
                  <span className={muted ? 'settings__hours-closed' : 'settings__hours-time'}>{text}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Subscription ──────────────────────────────────────────────────────────────
function SubscriptionSection() {
  const { hospital } = useAuth()
  const [subscription, setSubscription] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!hospital) return
    setError(null)
    try {
      const { data, error: queryError } = await supabase.from('subscriptions')
        .select().eq('hospital_id', hospital.id).maybeSingle()
      if (queryError) throw queryError
      setSubscription(data ?? null)
      setLoaded(true)
    } catch (err) {
      setError(err)
    }
  }, [hospital])

  // Same shape as Dashboard.jsx/Requests.jsx's load effect: queueMicrotask defers the
  // setState-reaching call by a tick so react-hooks/set-state-in-effect doesn't flag it,
  // while still guaranteeing the first load runs on mount/hospital-change.
  useEffect(() => {
    if (!hospital) return
    queueMicrotask(load)
  }, [hospital, load])

  return (
    <div className="settings__section">
      <div className="settings__section-header">
        <div>
          <h2 className="settings__section-title">Subscription</h2>
          <p className="settings__section-desc">Your current AppointMed plan and billing details.</p>
        </div>
      </div>

      {error && (
        <Card padding="lg" className="settings__banner settings__banner--error">
          <div className="settings__banner-content">
            <p className="settings__banner-title">
              {loaded ? "Couldn't refresh subscription" : "Couldn't load subscription"}
            </p>
            <p className="settings__banner-detail">
              {error.message || 'Please check your connection and try again.'}
              {loaded ? ' Showing the last data that loaded successfully.' : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
        </Card>
      )}

      {!loaded ? (
        error ? null : <p className="settings__loading">Loading subscription…</p>
      ) : !subscription ? (
        <Card variant="elevated" padding="lg">
          <EmptyState
            icon={<SubscriptionIcon />}
            title="No subscription on file"
            description="Contact support if you believe this is a mistake."
          />
        </Card>
      ) : (
        <Card variant="elevated" padding="lg">
          <div className="settings__sub-header">
            <div>
              <h3 className="settings__sub-plan">{PLAN_LABEL[subscription.plan] ?? subscription.plan}</h3>
              <p className="settings__sub-price">
                RM {Number(subscription.monthly_price_rm)}/mo + {Number(subscription.booking_fee_pct)}% per booking
              </p>
            </div>
            <Badge variant={SUBSCRIPTION_STATUS_VARIANT[subscription.status] ?? 'default'}>
              {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
            </Badge>
          </div>

          <div className="settings__sub-meta">
            <div className="settings__sub-meta-item">
              <span className="settings__sub-meta-label">Specialists</span>
              <span className="settings__sub-meta-value">
                {subscription.max_specialists == null ? 'Unlimited' : `Up to ${subscription.max_specialists}`}
              </span>
            </div>
            <div className="settings__sub-meta-item">
              <span className="settings__sub-meta-label">Renews</span>
              <span className="settings__sub-meta-value">{formatDate(subscription.renews_at)}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Specialists ────────────────────────────────────────────────────────────────
function SpecialistsSection() {
  const { hospital, session } = useAuth()
  const [specialists, setSpecialists] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useToast()

  const load = useCallback(async () => {
    if (!hospital) return
    setError(null)
    try {
      const { data, error: queryError } = await supabase.from('specialists')
        .select().eq('hospital_id', hospital.id).order('full_name')
      if (queryError) throw queryError
      setSpecialists(data ?? [])
      setLoaded(true)
    } catch (err) {
      setError(err)
    }
  }, [hospital])

  useEffect(() => {
    if (!hospital) return
    queueMicrotask(load)
  }, [hospital, load])

  // Deliberately not optimistic: the checkbox only ever reflects `specialists` state,
  // which is only ever updated by a successful reload after the engine confirms the
  // flip. A rejected request therefore never leaves a switch showing a state that
  // didn't actually persist - there's nothing to roll back because nothing was set
  // ahead of the response. `busyId` is cleared in `finally` either way, so a failure
  // never leaves the row stuck mid-flight.
  const toggle = async (specialist) => {
    if (!session) return
    setBusyId(specialist.id)
    try {
      await engine.toggleSpecialist(specialist.id, session.access_token)
      await load()
      setToast({
        tone: 'success',
        message: `${specialist.full_name} is now ${specialist.is_active ? 'inactive' : 'active'}.`,
      })
    } catch (err) {
      if (err.status === 404) {
        setToast({ tone: 'error', message: 'That specialist could no longer be found — refreshing the list.' })
        load()
      } else if (err.status === 403) {
        setToast({ tone: 'error', message: "You don't have permission to change this." })
      } else {
        setToast({ tone: 'error', message: "Couldn't reach the server. Nothing changed — check your connection and try again." })
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="settings__section">
      <div className="settings__section-header">
        <div>
          <h2 className="settings__section-title">Specialists</h2>
          <p className="settings__section-desc">
            Inactive specialists stop appearing in patient matching immediately.
          </p>
        </div>
      </div>

      {error && (
        <Card padding="lg" className="settings__banner settings__banner--error">
          <div className="settings__banner-content">
            <p className="settings__banner-title">
              {loaded ? "Couldn't refresh specialists" : "Couldn't load specialists"}
            </p>
            <p className="settings__banner-detail">
              {error.message || 'Please check your connection and try again.'}
              {loaded ? ' Showing the last data that loaded successfully.' : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
        </Card>
      )}

      {!loaded ? (
        error ? null : <p className="settings__loading">Loading specialists…</p>
      ) : specialists.length === 0 ? (
        <Card variant="elevated" padding="lg">
          <EmptyState
            icon={<SpecialistsIcon />}
            title="No specialists yet"
            description="Specialists you add will appear here."
          />
        </Card>
      ) : (
        <div className="settings__specialist-list">
          {specialists.map((sp) => (
            <div
              key={sp.id}
              className={`settings__specialist ${sp.is_active ? '' : 'settings__specialist--inactive'}`}
            >
              <div className="settings__specialist-info">
                <span className="settings__specialist-name">{sp.full_name}</span>
                <span className="settings__specialist-meta">{sp.specialty} · RM {Number(sp.price)}</span>
              </div>
              <Checkbox
                checked={sp.is_active}
                onChange={() => toggle(sp)}
                disabled={busyId === sp.id}
                label={sp.is_active ? 'Active' : 'Inactive'}
              />
            </div>
          ))}
        </div>
      )}

      <ToastBanner toast={toast} />
    </div>
  )
}

// ── Documents ──────────────────────────────────────────────────────────────────
// A real upload wired to the engine - no fabricated "previously uploaded" list, since
// there is no endpoint to read one back (verification-docs has no client SELECT policy
// either - it's service-role only).
function DocumentsSection() {
  const { session } = useAuth()
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useToast()
  // Bumped on a successful upload to remount <Upload>, which otherwise has no prop-based
  // way to clear the file list it manages internally.
  const [uploadKey, setUploadKey] = useState(0)

  const submit = async () => {
    if (!session || files.length === 0) return
    setUploading(true)
    try {
      const res = await engine.uploadVerificationDocs(files, session.access_token)
      const count = res.uploaded?.length ?? files.length
      setToast({ tone: 'success', message: `Uploaded ${count} document${count === 1 ? '' : 's'}.` })
      setFiles([])
      setUploadKey((k) => k + 1)
    } catch (err) {
      setToast({
        tone: 'error',
        message: err.status
          ? `Upload failed (${err.code ?? err.status}). Some documents may not have been saved — try again.`
          : "Couldn't reach the server. Check your connection and try again.",
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="settings__section">
      <div className="settings__section-header">
        <div>
          <h2 className="settings__section-title">Documents</h2>
          <p className="settings__section-desc">
            Upload hospital verification documents — license, registration certificate, manager ID.
            Our team reviews new uploads and will follow up if anything&apos;s needed.
          </p>
        </div>
      </div>

      <Upload
        key={uploadKey}
        label="Upload documents"
        description="PDF, JPG, PNG (max 10MB)"
        multiple
        onFiles={setFiles}
      />

      <div className="settings__actions settings__actions--plain">
        <Button onClick={submit} loading={uploading} disabled={files.length === 0}>
          {files.length > 0 ? `Upload ${files.length} file${files.length === 1 ? '' : 's'}` : 'Upload'}
        </Button>
      </div>

      <p className="settings__note">
        Previously uploaded documents aren&apos;t listed here yet — if you need to confirm what&apos;s on file, contact support.
      </p>

      <ToastBanner toast={toast} />
    </div>
  )
}

export default Settings
