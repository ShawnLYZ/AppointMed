import { useCallback, useEffect, useState } from 'react'
import PortalLayout from '../components/PortalLayout'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import CaseReportModal from '../components/CaseReportModal'
import { supabase } from '../lib/supabase'
import { adapter } from '../lib/adapter'
import { useAuth } from '../context/AuthContext'
import './Requests.css'

// Badge has no `danger` variant (default | primary | success | warning | error | info) -
// 'high' maps to 'error', 'low' to 'info' (matches Dashboard.jsx's PRIORITY_META, so the
// same appointment reads with the same priority color one nav-click apart instead of
// silently diverging). A null suggested_priority is looked up as 'low' too (see the render
// site below), same tone and same "LOW PRIORITY" display text - the AI booking flow
// (appointmed_engine/src/workflow/nodes/book.ts) always sets this for created_via_ai rows,
// so null only happens for a row created outside that flow.
const PRIORITY_VARIANT = { high: 'error', medium: 'warning', low: 'info' }

// Same status -> {label, tone} convention Dashboard.jsx uses for the appointments.status
// enum (duplicated locally - no shared constants module exists between pages yet), so
// "Recent decisions" reads with the same color language as the Dashboard activity feed
// instead of a flat badge that can't tell "declined" from "completed" at a glance.
const STATUS_META = {
  confirmed: { label: 'Confirmed', tone: 'primary' },
  reschedule_proposed: { label: 'Reschedule proposed', tone: 'info' },
  declined: { label: 'Declined', tone: 'error' },
  cancelled: { label: 'Cancelled', tone: 'default' },
  completed: { label: 'Completed', tone: 'success' },
}

// datetime-local's min/value must be *local* time formatted as YYYY-MM-DDTHH:mm (no
// seconds, no offset) - Date#toISOString() is UTC and would misalign with what the
// input itself produces/consumes, silently shifting the floor by the local UTC offset.
function toLocalDatetimeInput(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// These two wrap the only wall-clock reads this page needs. Defined at module level
// (not inline in the component, same as Dashboard.jsx's formatRelativeTime, which reads
// Date.now() the same way) because react-hooks/purity flags a *component's* body calling
// an impure built-in like Date.now() directly during render - it doesn't trace into an
// ordinary helper function's own body, which is exactly how Dashboard.jsx's equivalent
// call already passes the same lint rule.
function isFutureLocalDatetime(value) {
  return Boolean(value) && new Date(value).getTime() > Date.now()
}

function minSelectableLocalDatetime() {
  // +1 minute so the earliest option the native picker offers is never the same minute
  // this renders in - by the time a manager acts on it, "now" has moved on and that
  // value would immediately fail the isFutureLocalDatetime check below anyway.
  return toLocalDatetimeInput(new Date(Date.now() + 60000))
}

export default function Requests() {
  const { hospital, apiKeyRow } = useAuth()
  const [requests, setRequests] = useState([])
  const [decided, setDecided] = useState([])
  // Sentinel for "a load has ever succeeded", distinct from the arrays being merely empty -
  // same role Dashboard.jsx's `stats === null` plays - so a genuinely empty queue can be
  // told apart from "we haven't heard back yet" / "the last attempt failed".
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [openCase, setOpenCase] = useState(null) // appointment being reviewed, or null
  const [reschedule, setReschedule] = useState(null) // appointment being rescheduled, or null
  const [proposedTime, setProposedTime] = useState('')
  const [toast, setToast] = useState(null) // { tone: 'success'|'error'|'info', message } | null

  const load = useCallback(async () => {
    if (!hospital) return
    // Cleared eagerly so a retry immediately drops the banner instead of leaving a stale
    // error up while the new attempt is in flight - mirrors Dashboard.jsx's load().
    setError(null)
    try {
      const { data, error: queryError } = await supabase.from('appointments').select()
        .eq('hospital_id', hospital.id)
        .order('created_at', { ascending: false })
      // A query-level failure (incl. an RLS denial) resolves normally with `.error` set -
      // it doesn't reject the promise - so it has to be checked explicitly or a failed
      // load silently renders as "this hospital has zero requests" instead of "we
      // couldn't load your data".
      if (queryError) throw queryError
      const rows = data ?? []
      setRequests(rows.filter((a) => a.status === 'pending'))
      // "Recent decisions" means recently *decided*, not recently *created* - the query
      // above is ordered by created_at (right for the pending queue), so slicing straight
      // off it here would rank a decision just made on an older request behind decisions
      // made long ago on more-recently-created ones, or push it out of the top 10 entirely.
      // Same fix Dashboard.jsx's `recent` needed, incl. sorting a *copy* rather than
      // in-place so this can never mutate a shared array out from under another
      // derivation later.
      setDecided(
        [...rows.filter((a) => a.status !== 'pending')]
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .slice(0, 10)
      )
      setLoaded(true)
    } catch (err) {
      // Leave requests/decided untouched: on a first load they're still [] (renders as
      // "loading", not a false "confirmed empty" - loaded is still false); on a refresh
      // they keep the last good snapshot, shown under the error banner instead of being
      // wiped by a failed retry.
      setError(err)
    }
  }, [hospital])

  // Identical shape to Dashboard.jsx's load effect (see its comment for the full
  // rationale): queueMicrotask(load) guarantees the first load happens regardless of
  // whether Realtime ever connects, while staying clear of react-hooks/set-state-in-effect
  // (the rule flags a *synchronous* setState-reaching call in the effect body, not one
  // deferred a tick). The channel's SUBSCRIBED callback is a supplementary refresh that
  // narrows the gap between the microtask firing and the subscription actually going
  // live. Channel name is distinct from Dashboard's 'dash-appointments' per hospital-side
  // RLS scoping - each page's channel only ever delivers this hospital's rows.
  useEffect(() => {
    if (!hospital) return
    queueMicrotask(load)
    const channel = supabase
      .channel('requests-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, load)
      .subscribe((status) => { if (status === 'SUBSCRIBED') load() })
    return () => { supabase.removeChannel(channel) }
  }, [hospital, load])

  // Single toast slot (not a queue), auto-dismissed via an effect keyed on `toast` rather
  // than a bare setTimeout in the click handler: the returned cleanup cancels the pending
  // timer whenever `toast` changes again (a second decision replaces the first toast
  // instead of stacking) or the component unmounts (no setState-after-unmount).
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const canDecide = Boolean(apiKeyRow?.api_key)
  // The adapter only rejects a *missing* or *unparseable* proposedStartsAt
  // (appointmed_hospital_adapter/src/routes/appointments.ts) - a past timestamp gets a
  // clean 200 back with the patient postback-notified of a nonsensical past time. Nothing
  // downstream catches that, so the portal itself must not originate it.
  const proposedTimeIsFuture = isFutureLocalDatetime(proposedTime)

  const decide = async (appt, decision, proposedStartsAt) => {
    // Defends the dereference below even though the UI never renders these actions as
    // clickable in either case (see canDecide / hasExternalId at the call sites) - apiKeyRow
    // can be null (no active key for this hospital) and external_appointment_id can
    // legitimately be '' for a row not booked through the adapter, which would 404.
    if (!apiKeyRow?.api_key || !appt.external_appointment_id) return
    setBusyId(appt.id)
    try {
      const res = await adapter.decision(apiKeyRow.api_key, {
        externalAppointmentId: appt.external_appointment_id,
        decision,
        ...(proposedStartsAt ? { proposedStartsAt } : {}),
      })
      // Closed unconditionally once a response comes back (matches the brief's original
      // placement, right after the call resolves either way) - only the network-exception
      // path below (no response at all) leaves it open, since that's genuinely new
      // territory the brief's unwrapped original couldn't reach a decision on either way.
      setReschedule(null)
      if (res.ok) {
        setToast({
          tone: 'success',
          message: `Request ${res.body.status}` +
            (res.body.postbackDelivered ? ' — patient notified.' : ' — postback pending, patient will be notified shortly.'),
        })
        load()
      } else if (res.status === 409) {
        // Another manager already decided this one between page-load and this click.
        // That's not a failure - refresh so the queue matches reality instead of leaving
        // a stale pending row on screen that looks actionable but isn't.
        setToast({ tone: 'info', message: 'Already decided by another manager — refreshing the queue.' })
        load()
      } else if (res.status === 404) {
        setToast({ tone: 'error', message: "Booking not found on the hospital system — it may not have been booked through the API." })
      } else if (res.body?.error === 'proposed_time_required') {
        setToast({ tone: 'error', message: 'Choose a valid date and time before sending.' })
      } else {
        setToast({ tone: 'error', message: `The hospital API rejected this decision (${res.body?.error ?? res.status}).` })
      }
    } catch {
      // adapter.decision rejects only when fetch itself fails (adapter down, network
      // error, CORS) - the one path with no HTTP response to read a status/body from.
      // Reschedule (if any) deliberately stays open here: nothing was sent, so there's
      // nothing to reconcile, and the manager can retry without re-entering the time.
      setToast({ tone: 'error', message: "Couldn't reach the hospital API. Check your connection and try again." })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PortalLayout active="requests">
      <div className="requests">
        <h1 className="requests__title">Booking Requests</h1>
        <p className="requests__subtitle">
          AI-triaged requests from AppointMed patients. Decisions are sent through your
          hospital API and reach the patient instantly.
        </p>

        {error && (
          <Card padding="lg" className="requests__banner requests__banner--error">
            <div className="requests__banner-content">
              <p className="requests__banner-title">
                {loaded ? "Couldn't refresh requests" : "Couldn't load requests"}
              </p>
              <p className="requests__banner-detail">
                {error.message || 'Please check your connection and try again.'}
                {loaded ? ' Showing the last data that loaded successfully.' : ''}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
          </Card>
        )}

        {hospital && !apiKeyRow && (
          <Card padding="lg" className="requests__banner requests__banner--warning">
            <div className="requests__banner-content">
              <p className="requests__banner-title">No active API key</p>
              <p className="requests__banner-detail">
                This hospital has no active API key, so decisions can&apos;t be sent yet.
                Requests are still visible below.
              </p>
            </div>
          </Card>
        )}

        {!loaded ? (
          // No "Loading…" text once a load has already failed - the error banner above
          // already explains it, and this isn't actually in flight.
          error ? null : <p className="requests__loading">Loading requests…</p>
        ) : (
          <>
            {requests.length === 0 && (
              <Card padding="lg">
                <p className="requests__empty">No pending requests — new ones appear here in real time.</p>
              </Card>
            )}

            {requests.map((appt) => {
              const busy = busyId === appt.id
              const hasExternalId = Boolean(appt.external_appointment_id)
              const disableActions = busy || !canDecide || !hasExternalId
              return (
                <Card key={appt.id} variant="elevated" padding="lg" className="requests__card">
                  <div className="requests__row">
                    <div className="requests__who">
                      <span className="requests__patient">{appt.patient_name || 'Patient'}</span>
                      <span className="requests__meta">
                        {appt.specialty || 'General'}{appt.specialist_name ? ` · ${appt.specialist_name}` : ''} · {new Date(appt.starts_at).toLocaleString()}
                      </span>
                    </div>
                    <Badge variant={PRIORITY_VARIANT[appt.suggested_priority ?? 'low'] ?? 'default'}>
                      {(appt.suggested_priority ?? 'low').toUpperCase()} PRIORITY
                    </Badge>
                  </div>

                  {(appt.ai_report?.summary || appt.ai_summary) && (
                    <div className="requests__summary">
                      <span className="requests__summary-label">AI case report</span>
                      <p>{appt.ai_report?.summary || appt.ai_summary}</p>
                    </div>
                  )}
                  {(appt.ai_attachments?.length ?? 0) > 0 && (
                    <p className="requests__attach-chip">
                      📎 {appt.ai_attachments.length} attachment{appt.ai_attachments.length === 1 ? '' : 's'}
                    </p>
                  )}

                  {!hasExternalId && (
                    <p className="requests__warning">
                      Not booked through the hospital API — no action available for this request.
                    </p>
                  )}

                  <div className="requests__actions">
                    <Button variant="secondary" onClick={() => setOpenCase(appt)} disabled={busy}>
                      View full case
                    </Button>
                    <Button onClick={() => decide(appt, 'confirm')} disabled={disableActions}>
                      Confirm
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => { setReschedule(appt); setProposedTime('') }}
                      disabled={disableActions}
                    >
                      Propose new time
                    </Button>
                    <Button variant="danger" onClick={() => decide(appt, 'decline')} disabled={disableActions}>
                      Decline
                    </Button>
                  </div>
                </Card>
              )
            })}

            <h2 className="requests__section">Recent decisions</h2>
            {decided.length === 0 ? (
              <p className="requests__decided-empty">No decisions yet.</p>
            ) : (
              <div className="requests__decided-list">
                {decided.map((a) => {
                  const meta = STATUS_META[a.status] ?? { label: a.status.replace('_', ' '), tone: 'default' }
                  return (
                    <div key={a.id} className="requests__decided">
                      <span>{a.patient_name || 'Patient'} · {a.specialist_name || a.specialty || 'General'}</span>
                      <Badge variant={meta.tone}>{meta.label}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <Modal isOpen={Boolean(reschedule)} onClose={() => setReschedule(null)} title="Propose a new time" size="sm">
          {reschedule && (
            <>
              <p className="requests__reschedule-current">
                Current request: {new Date(reschedule.starts_at).toLocaleString()}
              </p>
              <input
                type="datetime-local"
                className="requests__datetime"
                aria-label="Proposed date and time"
                min={minSelectableLocalDatetime()}
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
              />
              {proposedTime && !proposedTimeIsFuture && (
                <p className="requests__warning">Pick a time in the future.</p>
              )}
              <div className="requests__actions">
                <Button
                  disabled={!proposedTimeIsFuture || busyId === reschedule.id}
                  onClick={() => decide(reschedule, 'reschedule', new Date(proposedTime).toISOString())}
                >
                  Send proposal
                </Button>
                <Button variant="secondary" onClick={() => setReschedule(null)}>Cancel</Button>
              </div>
            </>
          )}
        </Modal>

        {openCase && (
          <CaseReportModal
            appointment={openCase}
            onClose={() => setOpenCase(null)}
            busy={busyId === openCase.id}
            canDecide={canDecide && Boolean(openCase.external_appointment_id)}
            onDecide={(appt, decision) => {
              setOpenCase(null)
              if (decision === 'reschedule') { setReschedule(appt); setProposedTime('') }
              else decide(appt, decision)
            }}
          />
        )}

        {toast && (
          <div className={`requests__toast requests__toast--${toast.tone}`} role="status">
            {toast.message}
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
