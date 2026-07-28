import { useEffect, useState } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Tabs from '../components/ui/Tabs'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import PortalLayout from '../components/PortalLayout'
import { useAuth } from '../context/AuthContext'
import { engine } from '../lib/engine'
import { adapter } from '../lib/adapter'
import './Integration.css'

// Reused for both "no active key" empty states (API Key tab and Tester tab).
const KeyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
)

// Reused for each Security Best Practices tip.
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

// Reused by both "Copy" buttons (API key value, code example). Forwards props so the
// code-example usage can still apply its smaller inline size.
const CopyIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)

// Keeps the key's "environment" prefix (e.g. "amk_live_", "amk_demo_") visible so a
// manager can still tell keys apart at a glance, and masks everything after it - the
// only part that's actually secret.
function maskApiKey(key) {
  const prefixMatch = /^[a-z0-9]+_[a-z0-9]+_/i.exec(key)
  const prefix = prefixMatch ? prefixMatch[0] : ''
  return `${prefix}${'•'.repeat(20)}`
}

// Same shape as Dashboard.jsx's formatRelativeTime (duplicated locally - no shared
// utils module exists between pages yet, per that file's own comment on this helper).
// Defined at module level as a *function* (never a module-level constant) so
// react-hooks/purity doesn't flag the Date.now() read - the rule only traces a
// component's own render body, not a plain helper function's.
function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.round(diffHour / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const Integration = () => {
  // Lifted out of ApiKeyTab: Tabs unmounts/remounts each tab's content on switch (it
  // renders only `tabs[activeTab]?.content`, not all three kept alive and hidden), so
  // state living inside ApiKeyTab itself can't survive a manager clicking away and back.
  // staleKey specifically must survive that - it's the only thing standing between a
  // dead, already-revoked key and it silently redisplaying as "Active" with no warning
  // the moment its tab remounts. (The rest of ApiKeyTab's state - showKey, confirmOpen,
  // regenerating, toast - is fine to reset on remount, so it stays local to that component.)
  const [staleKey, setStaleKey] = useState(false)

  return (
    <PortalLayout active="integration">
      <div className="integration">
        <div className="integration__intro">
          <h1 className="integration__title">API Integration</h1>
          <p className="integration__subtitle">
            Manage your live API key and test the hospital API AppointMed uses to book and manage appointments
          </p>
        </div>

        <Tabs
          tabs={[
            { label: 'API Key', content: <ApiKeyTab staleKey={staleKey} setStaleKey={setStaleKey} /> },
            { label: 'Documentation', content: <DocsTab /> },
            { label: 'API Tester', content: <TesterTab /> }
          ]}
        />
      </div>
    </PortalLayout>
  )
}

const ApiKeyTab = ({ staleKey, setStaleKey }) => {
  const { session, apiKeyRow, loading: authLoading, refresh } = useAuth()
  const [showKey, setShowKey] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [toast, setToast] = useState(null) // { tone: 'success'|'error', message } | null

  // Single toast slot, auto-dismissed via an effect keyed on `toast` - same shape as
  // Requests.jsx: the cleanup cancels the pending timer whenever `toast` changes again
  // (a new toast replaces the old one's timer instead of stacking) or on unmount.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const copyToClipboard = () => {
    if (!apiKeyRow) return
    navigator.clipboard.writeText(apiKeyRow.api_key)
  }

  // Reloads just the API key (and profile/hospital) without re-running the regenerate
  // call itself - the only way to recover from a regenerate that succeeded on the server
  // but whose refresh() we couldn't complete.
  const retryRefresh = async () => {
    setRetrying(true)
    try {
      await refresh()
      setStaleKey(false)
      setToast({ tone: 'success', message: 'New key active — the old key was revoked.' })
    } catch {
      setToast({ tone: 'error', message: "Still couldn't load your key. Check your connection and try again." })
    } finally {
      setRetrying(false)
    }
  }

  const handleRegenerate = async () => {
    setConfirmOpen(false)
    // Defends the dereference below even though the button that reaches this is only
    // ever rendered once apiKeyRow is truthy - session is guaranteed by ProtectedRoute
    // in practice, but this keeps the call a no-op instead of a crash if that ever changes.
    if (!session || !apiKeyRow) return
    setRegenerating(true)
    try {
      await engine.regenerateApiKey(session.access_token)
    } catch (err) {
      // The call itself failed - nothing changed server-side, the key on screen is
      // still the real, active one.
      setRegenerating(false)
      setToast({
        tone: 'error',
        message: err.status
          ? `The server rejected the request (${err.code ?? err.status}). Nothing changed — try again.`
          : "Couldn't reach the server. Check your connection and try again — your key wasn't changed.",
      })
      return
    }
    // The old key is revoked from this point on no matter what refresh() does next -
    // see the staleKey comment above.
    try {
      await refresh()
      setToast({ tone: 'success', message: 'New key active — the old key was revoked.' })
    } catch {
      setStaleKey(true)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="integration__tab">
      {authLoading && (
        <Card variant="elevated" padding="lg">
          <p className="integration__loading">Loading your API key…</p>
        </Card>
      )}

      {!authLoading && !apiKeyRow && (
        <Card variant="elevated" padding="lg">
          <EmptyState
            icon={<KeyIcon />}
            title="No active API key"
            description="This hospital doesn't have an active API key yet. Contact support if you believe this is a mistake."
          />
        </Card>
      )}

      {!authLoading && apiKeyRow && (
        <>
          {staleKey && (
            <Card padding="lg" className="integration__banner integration__banner--error">
              <div className="integration__banner-content">
                <p className="integration__banner-title">Key regenerated, but we couldn&apos;t confirm it</p>
                <p className="integration__banner-detail">
                  Your old key was revoked, but loading the new one failed. The key shown
                  below is no longer valid — don&apos;t copy it. Retry to load your current key.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={retryRefresh} loading={retrying}>
                Retry
              </Button>
            </Card>
          )}

          <Card variant="elevated" padding="lg">
            <div className="apikey__header">
              <div>
                <h3 className="apikey__title">Your API Key</h3>
                <p className="apikey__desc">
                  Use this key to authenticate requests to the hospital API — see the
                  Documentation tab for the full contract.
                </p>
              </div>
              <Badge variant={staleKey ? 'error' : 'success'}>{staleKey ? 'Revoked' : 'Active'}</Badge>
            </div>

            <div className="apikey__key-display">
              <div className="apikey__key">
                <span className="apikey__key-icon">
                  <KeyIcon />
                </span>
                <code className="apikey__key-value">
                  {showKey ? apiKeyRow.api_key : maskApiKey(apiKeyRow.api_key)}
                </code>
              </div>
              <div className="apikey__actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKey(!showKey)}
                  icon={
                    showKey ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )
                  }
                >
                  {showKey ? 'Hide' : 'Show'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyToClipboard}
                  disabled={staleKey}
                  icon={<CopyIcon />}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="apikey__meta">
              <div className="apikey__meta-item">
                <span className="apikey__meta-label">Requests Served</span>
                <span className="apikey__meta-value">{apiKeyRow.request_count}</span>
              </div>
              <div className="apikey__meta-item">
                <span className="apikey__meta-label">Last Used</span>
                <span className="apikey__meta-value">
                  {apiKeyRow.last_used_at ? formatRelativeTime(apiKeyRow.last_used_at) : 'Never used'}
                </span>
              </div>
            </div>

            <div className="apikey__danger">
              <h4>Regenerate API Key</h4>
              <p>
                Regenerating your API key will immediately invalidate the current key.
                You&apos;ll need to update anything using it — including this tab — with the new key.
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                loading={regenerating}
                disabled={staleKey}
              >
                Regenerate Key
              </Button>
            </div>
          </Card>
        </>
      )}

      <Card variant="elevated" padding="lg" className="integration__info-card">
        <h3 className="integration__card-title">Security Best Practices</h3>
        <ul className="integration__tips">
          <li>
            <span className="integration__tip-icon"><CheckIcon /></span>
            <span>Never expose your API key in client-side code or public repositories</span>
          </li>
          <li>
            <span className="integration__tip-icon"><CheckIcon /></span>
            <span>Store your API key in environment variables on your server</span>
          </li>
          <li>
            <span className="integration__tip-icon"><CheckIcon /></span>
            <span>Rotate your API key periodically for enhanced security</span>
          </li>
          <li>
            <span className="integration__tip-icon"><CheckIcon /></span>
            <span>Contact support immediately if you suspect your key has been compromised</span>
          </li>
        </ul>
      </Card>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Regenerate API key?"
        size="sm"
      >
        <p className="apikey__modal-text">
          This immediately revokes your current key. Anything still using it — including
          your real hospital system, once it&apos;s wired up — will start failing until it&apos;s
          updated with the new one.
        </p>
        <div className="integration__modal-actions">
          <Button variant="danger" onClick={handleRegenerate} loading={regenerating}>
            Regenerate key
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={regenerating}>
            Cancel
          </Button>
        </div>
      </Modal>

      {toast && (
        <div className={`integration__toast integration__toast--${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  )
}

const DOCS_ENDPOINTS = [
  { method: 'GET', path: '/specialists', description: "The hospital's active specialists." },
  { method: 'GET', path: '/slots?specialty=&maxPrice=&from=&to=&limit=', description: 'Open future slots, ordered by time.' },
  { method: 'POST', path: '/appointment/confirm', description: 'Books a slot; creates a pending booking.' },
  { method: 'POST', path: '/appointment/cancel', description: 'Cancels a booking and reopens its slot.' },
  { method: 'POST', path: '/appointment/decision', description: 'Confirm, decline, or reschedule a pending booking.' },
]

// Concrete request/response examples for the four routes not already covered by the
// Code Example / Response Example cards below. Field names and shapes match
// appointmed_hospital_adapter/src/routes/*.ts exactly; hospital/specialist values match
// the real seeded demo data (supabase/seed.sql) so this reads as genuine, not invented.
const DOCS_EXAMPLES = [
  {
    method: 'GET',
    path: '/slots?specialty=Cardiology',
    response: {
      hospital: { id: '<hospital-uuid>', name: 'KL Medical Center' },
      slots: [
        {
          id: '<slot-uuid>',
          specialistId: '<specialist-uuid>',
          specialistName: 'Dr. Sarah Chen',
          specialty: 'Cardiology',
          startsAt: '2026-07-22T09:00:00.000Z',
          endsAt: '2026-07-22T09:30:00.000Z',
          price: 150,
          hospitalId: '<hospital-uuid>',
          hospitalName: 'KL Medical Center',
          hospitalAddress: '123 Jalan Tun Razak, Kuala Lumpur, 50400',
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/appointment/confirm',
    request: { slotId: '<slot-uuid>', patientName: 'Aisyah Kamal', note: 'Prefers a morning slot' },
    response: {
      externalAppointmentId: 'ext_4f9a21bc8d3e0f6a',
      status: 'pending',
      slot: { id: '<slot-uuid>', startsAt: '2026-07-22T09:00:00.000Z', specialistName: 'Dr. Sarah Chen', specialty: 'Cardiology', price: 150 },
    },
    errors: '404 slot_not_found · 409 slot_taken',
  },
  {
    method: 'POST',
    path: '/appointment/cancel',
    request: { externalAppointmentId: 'ext_4f9a21bc8d3e0f6a' },
    response: { externalAppointmentId: 'ext_4f9a21bc8d3e0f6a', status: 'cancelled', postbackDelivered: true },
    errors: '404 booking_not_found',
  },
  {
    method: 'POST',
    path: '/appointment/decision',
    request: { externalAppointmentId: 'ext_4f9a21bc8d3e0f6a', decision: 'confirm' },
    response: { externalAppointmentId: 'ext_4f9a21bc8d3e0f6a', status: 'confirmed', postbackDelivered: true },
    errors: '400 invalid_decision / proposed_time_required · 404 booking_not_found · 409 already_decided',
  },
]

const DocsTab = () => {
  const codeExamples = {
    curl: `curl "http://localhost:8090/specialists" \\
  -H "x-api-key: YOUR_API_KEY"`,
    javascript: `const response = await fetch('http://localhost:8090/specialists', {
  headers: { 'x-api-key': 'YOUR_API_KEY' }
})

const { specialists } = await response.json()`,
    python: `import requests

response = requests.get(
    'http://localhost:8090/specialists',
    headers={'x-api-key': 'YOUR_API_KEY'}
)

specialists = response.json()['specialists']`
  }

  const [activeTab, setActiveTab] = useState('curl')

  return (
    <div className="integration__tab">
      {/* Overview */}
      <Card variant="elevated" padding="lg" className="integration__doc-section">
        <h3 className="integration__card-title">Integration Overview</h3>
        <p className="integration__card-desc">
          AppointMed talks to your hospital system over a REST API secured by your API key
          (see the API Key tab). The engine calls it to check availability and submit
          AI-triaged bookings; this portal calls it directly whenever you confirm, decline,
          or reschedule a request from the Requests page. Every endpoint below is live now
          — try it yourself in the API Tester tab.
        </p>

        <div className="integration__flow-diagram">
          <div className="integration__flow-box">
            <span className="integration__flow-label">Hospital Adapter</span>
            <span className="integration__flow-endpoints">Your hospital system<br/>localhost:8090</span>
          </div>
          <div className="integration__flow-arrow" aria-hidden="true">⇄</div>
          <div className="integration__flow-box integration__flow-box--primary">
            <span className="integration__flow-label">AppointMed Platform</span>
            <span className="integration__flow-endpoints">Engine · AI chat<br/>Patient app</span>
          </div>
        </div>
        <p className="integration__flow-caption">
          AppointMed calls the five endpoints below to read availability and submit
          bookings. The adapter calls back with <code>POST /postback</code> whenever a
          booking&apos;s status changes, so patients are notified the moment you act on a request.
        </p>
      </Card>

      {/* Endpoints */}
      <Card variant="elevated" padding="lg" className="integration__doc-section">
        <h3 className="integration__card-title">Hospital API Endpoints</h3>
        <p className="integration__card-desc">
          Base URL <code>http://localhost:8090</code> · every request authenticates with an{' '}
          <code>x-api-key</code> header · every response is JSON. A missing or wrong key
          returns 401 with error code <code>missing_api_key</code> or <code>invalid_api_key</code>.
        </p>

        <div className="integration__endpoints">
          {DOCS_ENDPOINTS.map((endpoint) => (
            <div key={endpoint.path} className="integration__endpoint">
              <span className={`integration__method integration__method--${endpoint.method.toLowerCase()}`}>
                {endpoint.method}
              </span>
              <code className="integration__path">{endpoint.path}</code>
              <span className="integration__endpoint-desc">{endpoint.description}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Code Example */}
      <Card variant="elevated" padding="lg" className="integration__doc-section">
        <h3 className="integration__card-title">Code Example</h3>
        <p className="integration__card-desc">
          Fetch your hospital&apos;s specialists — swap in your own key from the API Key tab.
        </p>

        <div className="integration__code-tabs">
          {['curl', 'javascript', 'python'].map((lang) => (
            <button
              key={lang}
              className={`integration__code-tab ${activeTab === lang ? 'integration__code-tab--active' : ''}`}
              onClick={() => setActiveTab(lang)}
            >
              {lang.charAt(0).toUpperCase() + lang.slice(1)}
            </button>
          ))}
        </div>

        <div className="integration__code-block">
          <pre><code>{codeExamples[activeTab]}</code></pre>
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(codeExamples[activeTab])}>
            <CopyIcon style={{ width: 16, height: 16, marginRight: 4 }} />
            Copy
          </Button>
        </div>
      </Card>

      {/* Response Example */}
      <Card variant="elevated" padding="lg" className="integration__doc-section">
        <h3 className="integration__card-title">Response Example</h3>
        <p className="integration__card-desc">
          Sample response from <code>GET /specialists</code>
        </p>

        <div className="integration__code-block">
          <pre><code>{JSON.stringify({
  hospital: { id: '<hospital-uuid>', name: 'KL Medical Center' },
  specialists: [
    { id: '<specialist-uuid>', fullName: 'Dr. Sarah Chen', specialty: 'Cardiology', price: 150, isActive: true },
    { id: '<specialist-uuid>', fullName: 'Dr. Priya Nair', specialty: 'General Practice', price: 80, isActive: true }
  ]
}, null, 2)}</code></pre>
        </div>
      </Card>

      {/* Remaining endpoints, request + response */}
      <Card variant="elevated" padding="lg" className="integration__doc-section">
        <h3 className="integration__card-title">Request &amp; Response Reference</h3>
        <p className="integration__card-desc">
          The rest of the contract — same base URL and <code>x-api-key</code> header as above.
        </p>

        <div className="integration__examples">
          {DOCS_EXAMPLES.map((ex) => (
            <div key={ex.path} className="integration__example">
              <div className="integration__endpoint">
                <span className={`integration__method integration__method--${ex.method.toLowerCase()}`}>
                  {ex.method}
                </span>
                <code className="integration__path">{ex.path}</code>
              </div>

              {ex.request && (
                <>
                  <span className="integration__example-label">Request</span>
                  <div className="integration__code-block">
                    <pre><code>{JSON.stringify(ex.request, null, 2)}</code></pre>
                  </div>
                </>
              )}

              <span className="integration__example-label">Response</span>
              <div className="integration__code-block">
                <pre><code>{JSON.stringify(ex.response, null, 2)}</code></pre>
              </div>

              {ex.errors && <p className="integration__example-errors">Errors: {ex.errors}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

const TESTER_ENDPOINTS = [
  { value: 'specialists', label: 'GET /specialists' },
  { value: 'slots', label: 'GET /slots' },
  { value: 'confirm', label: 'POST /appointment/confirm' },
]

function describeRequest(endpoint, specialty) {
  if (endpoint === 'specialists') return 'GET /specialists'
  if (endpoint === 'slots') {
    return `GET /slots${specialty.trim() ? `?specialty=${encodeURIComponent(specialty.trim())}` : ''}`
  }
  return 'POST /appointment/confirm'
}

const TesterTab = () => {
  const { apiKeyRow, loading: authLoading } = useAuth()
  const [endpoint, setEndpoint] = useState('specialists')
  const [specialty, setSpecialty] = useState('Cardiology')
  const [slotId, setSlotId] = useState('')
  const [result, setResult] = useState(null)
  const [requestLabel, setRequestLabel] = useState('')
  const [running, setRunning] = useState(false)
  const [networkError, setNetworkError] = useState(null)

  // Switching endpoints drops whatever result/error is on screen - it belongs to a
  // different request and would otherwise sit there under a mismatched selection.
  const selectEndpoint = (value) => {
    setEndpoint(value)
    setResult(null)
    setNetworkError(null)
  }

  const canRun = Boolean(apiKeyRow?.api_key) && (endpoint !== 'confirm' || slotId.trim().length > 0)

  const run = async () => {
    if (!apiKeyRow?.api_key) return
    setRunning(true)
    setNetworkError(null)
    setResult(null)
    // Captured before the await so it reflects exactly what was sent, even if the
    // endpoint/specialty inputs change while this request is still in flight.
    const label = describeRequest(endpoint, specialty)
    try {
      const key = apiKeyRow.api_key
      const res = endpoint === 'specialists' ? await adapter.getSpecialists(key)
        : endpoint === 'slots' ? await adapter.getSlots(key, specialty.trim() ? { specialty: specialty.trim() } : {})
        : await adapter.confirm(key, { slotId: slotId.trim(), patientName: 'API Tester' })
      setRequestLabel(label)
      setResult(res)
    } catch {
      // adapter.* only rejects when fetch itself fails - the adapter is unreachable
      // (not running, wrong ADAPTER_URL, CORS, offline) - so there's no status/body to
      // show, unlike a 4xx/5xx response which resolves normally below.
      setRequestLabel(label)
      setNetworkError("Couldn't reach the hospital API adapter. Check it's running and reachable, then try again.")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="integration__tab">
      <Card variant="elevated" padding="lg" className="integration__tester">
        <h3 className="integration__card-title">API Tester</h3>
        <p className="integration__card-desc">
          Call the live hospital API with your real API key — the same requests AppointMed itself makes.
        </p>

        {authLoading ? (
          <p className="integration__loading">Loading your API key…</p>
        ) : !apiKeyRow ? (
          <EmptyState
            icon={<KeyIcon />}
            title="No active API key"
            description="Generate a key on the API Key tab before testing live requests."
          />
        ) : (
          <div className="tester__config">
            <div className="tester__endpoint-select">
              <label className="tester__label" htmlFor="tester-endpoint">Endpoint</label>
              <select
                id="tester-endpoint"
                className="tester__select"
                value={endpoint}
                onChange={(e) => selectEndpoint(e.target.value)}
                disabled={running}
              >
                {TESTER_ENDPOINTS.map((ep) => (
                  <option key={ep.value} value={ep.value}>{ep.label}</option>
                ))}
              </select>
            </div>

            {endpoint === 'slots' && (
              <div className="tester__params">
                <label className="tester__label" htmlFor="tester-specialty">Specialty</label>
                <input
                  id="tester-specialty"
                  type="text"
                  className="tester__param-input"
                  placeholder="Blank matches any specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  disabled={running}
                />
              </div>
            )}

            {endpoint === 'confirm' && (
              <>
                <div className="tester__warning" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span>
                    <strong>This books a real slot.</strong> Confirming here creates an actual
                    pending booking in the hospital system, exactly like a live integration
                    would — it isn&apos;t a simulation. Use a slot ID you&apos;re prepared to see booked.
                  </span>
                </div>
                <div className="tester__params">
                  <label className="tester__label" htmlFor="tester-slot-id">Slot ID</label>
                  <input
                    id="tester-slot-id"
                    type="text"
                    className="tester__param-input"
                    placeholder="Paste an id from a /slots response"
                    value={slotId}
                    onChange={(e) => setSlotId(e.target.value)}
                    disabled={running}
                  />
                </div>
              </>
            )}

            <Button
              onClick={run}
              loading={running}
              disabled={!canRun}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              }
            >
              Send Request
            </Button>
          </div>
        )}
      </Card>

      {networkError && (
        <Card padding="lg" className="integration__banner integration__banner--error">
          <div className="integration__banner-content">
            <p className="integration__banner-title">Request failed</p>
            <p className="integration__banner-detail">{networkError}</p>
          </div>
        </Card>
      )}

      {result && (
        <Card variant="elevated" padding="lg" className="integration__response">
          <div className="tester__response-header">
            <h4>Response</h4>
            <Badge variant={result.ok ? 'success' : 'error'}>{result.status}</Badge>
          </div>
          <p className="tester__response-request"><code>{requestLabel}</code></p>
          <div className="integration__code-block">
            <pre><code>{JSON.stringify(result.body, null, 2)}</code></pre>
          </div>
        </Card>
      )}
    </div>
  )
}

export default Integration
