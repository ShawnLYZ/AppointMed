import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Progress from '../components/ui/Progress'
import EmptyState from '../components/ui/EmptyState'
import PortalLayout from '../components/PortalLayout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import './Dashboard.css'

// status -> { label, tone }. `tone` doubles as both the Badge `variant` name and the
// `dashboard__list-icon--{tone}` modifier, so there is one place that decides how a
// status reads instead of parallel switch statements scattered through the JSX.
const STATUS_META = {
  pending: { label: 'Pending', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'primary' },
  reschedule_proposed: { label: 'Reschedule proposed', tone: 'info' },
  declined: { label: 'Declined', tone: 'error' },
  cancelled: { label: 'Cancelled', tone: 'default' },
  completed: { label: 'Completed', tone: 'success' },
}

const PRIORITY_META = {
  high: { label: 'High priority', tone: 'error' },
  medium: { label: 'Medium priority', tone: 'warning' },
  low: { label: 'Low priority', tone: 'info' },
}

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

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const InboxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
)

const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

// Shared row for both the pending-requests preview and the recent-activity list: both
// are "an appointment-shaped row with a name, a detail line, a status-ish badge and a
// timestamp", so one renderer covers both instead of duplicating the row markup twice.
function DashboardListItem({ tone, title, detail, badgeLabel, time }) {
  return (
    <div className="dashboard__list-item">
      <div className={`dashboard__list-icon dashboard__list-icon--${tone}`}>
        <CalendarIcon />
      </div>
      <div className="dashboard__list-content">
        <p className="dashboard__list-title">{title}</p>
        <span className="dashboard__list-detail">{detail}</span>
      </div>
      <div className="dashboard__list-trailing">
        {badgeLabel && <Badge variant={tone} size="sm">{badgeLabel}</Badge>}
        <span className="dashboard__list-time">{time}</span>
      </div>
    </div>
  )
}

const Dashboard = () => {
  const { hospital } = useAuth()
  const [stats, setStats] = useState(null)
  const [pending, setPending] = useState([])
  const [recent, setRecent] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!hospital) return
    // Cleared eagerly (not just on success) so a retry immediately drops the banner
    // instead of leaving a stale error up while the new attempt is in flight - same
    // shape as AuthContext.resolveSession's setAuthError(null)-before-try.
    setError(null)
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(todayStart)
      todayEnd.setDate(todayEnd.getDate() + 1)

      const [appts, specialists, slots] = await Promise.all([
        supabase.from('appointments')
          .select('id, status, specialty, patient_name, specialist_name, starts_at, created_at, updated_at, suggested_priority')
          .eq('hospital_id', hospital.id),
        supabase.from('specialists').select('id, is_active').eq('hospital_id', hospital.id),
        supabase.from('slots').select('id', { count: 'exact', head: true })
          .eq('hospital_id', hospital.id).eq('status', 'open')
          // Upper-bounded to the calendar day so "today" actually means today, not
          // "today or any day after" - the brief's own prose names this tile "Open
          // slots today" even though its starter query only had the lower bound.
          .gte('starts_at', todayStart.toISOString()).lt('starts_at', todayEnd.toISOString()),
      ])
      // Query-level failures (incl. RLS denials) resolve normally with `.error` set -
      // they don't reject the promise - so each has to be checked explicitly or a
      // failed load silently renders as "hospital has zero appointments/specialists/
      // slots" instead of "we couldn't load your data."
      if (appts.error) throw appts.error
      if (specialists.error) throw specialists.error
      if (slots.error) throw slots.error

      const rows = appts.data ?? []

      // Map instead of the brief's `{ ...m, [key]: ... }` spread-per-row, which rebuilds
      // the whole accumulator object on every appointment (quadratic in row count).
      const bySpecialtyCounts = new Map()
      for (const row of rows) {
        const key = row.specialty || 'General'
        bySpecialtyCounts.set(key, (bySpecialtyCounts.get(key) ?? 0) + 1)
      }

      setStats({
        today: rows.filter((a) => new Date(a.created_at) >= todayStart).length,
        pending: rows.filter((a) => a.status === 'pending').length,
        specialists: specialists.data?.filter((s) => s.is_active).length ?? 0,
        openSlots: slots.count ?? 0,
        bySpecialty: [...bySpecialtyCounts.entries()].sort((a, b) => b[1] - a[1]),
      })
      setPending(
        rows.filter((a) => a.status === 'pending')
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5)
      )
      // Sort a *copy* - `rows` already fed the bySpecialty/pending derivations above, so
      // sorting it in place here would silently reorder it out from under them on the
      // next edit, even though today it happens to run last and looks harmless.
      setRecent([...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6))
    } catch (err) {
      // Deliberately leave stats/pending/recent untouched: on a first load they're
      // still null/[] (renders as "loading", not a false "confirmed empty"); on a
      // refresh they still hold the last good snapshot, which stays on screen under
      // the error banner instead of being wiped by a failed retry.
      setError(err)
    }
  }, [hospital])

  // Guarantees data loads regardless of what Realtime does, while keeping
  // react-hooks/set-state-in-effect (enabled via eslint.config.js's
  // reactHooks.configs.flat.recommended) clean:
  //  - `queueMicrotask(load)` runs the initial load unconditionally, once per
  //    mount/hospital-change, independent of whether the channel ever subscribes.
  //    It's deferred a tick specifically so it is not a *synchronous* setState-
  //    reaching call in the effect body, which is what that rule actually flags
  //    (confirmed by reading the rule's source, not just by trial and error).
  //  - the channel's `.subscribe(status => ...)` callback also calls `load` on
  //    'SUBSCRIBED', to narrow the small window between the microtask firing and
  //    the subscription actually going live (a change landing in that window would
  //    otherwise sit unseen until the next postgres_changes event).
  //  - CHANNEL_ERROR / TIMED_OUT / CLOSED are intentionally left unhandled: once the
  //    microtask load is unconditional, those three add no correctness value (data
  //    is already guaranteed to load) - only redundant fetches for no fix.
  useEffect(() => {
    if (!hospital) return
    queueMicrotask(load)
    const channel = supabase
      .channel('dash-appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, load)
      .subscribe((status) => { if (status === 'SUBSCRIBED') load() })
    return () => { supabase.removeChannel(channel) }
  }, [hospital, load])

  const maxSpecialtyCount = stats?.bySpecialty.length
    ? Math.max(...stats.bySpecialty.map(([, count]) => count))
    : 0

  return (
    <PortalLayout active="dashboard">
      <div className="dashboard">
        <div className="dashboard__welcome">
          <h1 className="dashboard__title">Dashboard</h1>
          <p className="dashboard__subtitle">
            {hospital?.name
              ? `Here's what's happening at ${hospital.name} today.`
              : 'Loading your hospital…'}
          </p>
        </div>

        {error && (
          <Card padding="lg" className="dashboard__error">
            <div className="dashboard__error-content">
              <p className="dashboard__error-title">
                {stats ? "Couldn't refresh dashboard data" : "Couldn't load dashboard data"}
              </p>
              <p className="dashboard__error-detail">
                {error.message || 'Please check your connection and try again.'}
                {stats ? ' Showing the last data that loaded successfully.' : ''}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
          </Card>
        )}

        <div className="dashboard__stats">
          <Card variant="elevated" padding="lg" className="dashboard__stat-card">
            <div className="dashboard__stat-icon"><CalendarIcon /></div>
            <div className={`dashboard__stat-value${stats ? '' : ' dashboard__stat-value--pending'}`}>
              {stats ? stats.today : '–'}
            </div>
            <div className="dashboard__stat-label">Requests today</div>
          </Card>

          <Link to="/requests" className="dashboard__stat-link">
            <Card variant="elevated" padding="lg" className="dashboard__stat-card dashboard__stat-card--highlight">
              <div className="dashboard__stat-icon dashboard__stat-icon--highlight"><InboxIcon /></div>
              <div className={`dashboard__stat-value${stats ? '' : ' dashboard__stat-value--pending'}`}>
                {stats ? stats.pending : '–'}
              </div>
              <div className="dashboard__stat-label">Pending requests</div>
            </Card>
          </Link>

          <Card variant="elevated" padding="lg" className="dashboard__stat-card">
            <div className="dashboard__stat-icon"><PeopleIcon /></div>
            <div className={`dashboard__stat-value${stats ? '' : ' dashboard__stat-value--pending'}`}>
              {stats ? stats.specialists : '–'}
            </div>
            <div className="dashboard__stat-label">Active specialists</div>
          </Card>

          <Card variant="elevated" padding="lg" className="dashboard__stat-card">
            <div className="dashboard__stat-icon"><ClockIcon /></div>
            <div className={`dashboard__stat-value${stats ? '' : ' dashboard__stat-value--pending'}`}>
              {stats ? stats.openSlots : '–'}
            </div>
            <div className="dashboard__stat-label">Open slots today</div>
          </Card>
        </div>

        <div className="dashboard__charts">
          <Card variant="elevated" padding="lg" className="dashboard__chart">
            <div className="dashboard__chart-header">
              <h3 className="dashboard__chart-title">Pending requests</h3>
              <Link to="/requests" className="dashboard__chart-link">View all</Link>
            </div>
            {stats === null ? (
              // No "Loading…" text when a load already failed - the error banner
              // above already explains it, and this isn't actually in flight.
              error ? null : <p className="dashboard__loading">Loading…</p>
            ) : pending.length === 0 ? (
              <EmptyState
                icon={<InboxIcon />}
                title="No pending requests"
                description="New AI bookings from the mobile app will show up here."
              />
            ) : (
              <div className="dashboard__list">
                {pending.map((a) => {
                  const priority = PRIORITY_META[a.suggested_priority]
                  return (
                    <DashboardListItem
                      key={a.id}
                      tone={priority?.tone ?? 'default'}
                      title={a.patient_name || 'Unnamed patient'}
                      detail={`${a.specialty || 'General'}${a.specialist_name ? ` • ${a.specialist_name}` : ''}`}
                      badgeLabel={priority?.label}
                      time={formatRelativeTime(a.created_at)}
                    />
                  )
                })}
              </div>
            )}
          </Card>

          <Card variant="elevated" padding="lg" className="dashboard__chart">
            <div className="dashboard__chart-header">
              <h3 className="dashboard__chart-title">By specialty</h3>
              <span className="dashboard__chart-period">All time</span>
            </div>
            {stats === null ? (
              error ? null : <p className="dashboard__loading">Loading…</p>
            ) : stats.bySpecialty.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon />}
                title="No requests yet"
                description="The specialty breakdown appears once patients start booking."
              />
            ) : (
              <div className="dashboard__specialty-bars">
                {stats.bySpecialty.map(([specialty, count]) => (
                  <div key={specialty} className="dashboard__specialty-row">
                    <div className="dashboard__specialty-row-header">
                      <span className="dashboard__specialty-name">{specialty}</span>
                      <span className="dashboard__specialty-count">{count}</span>
                    </div>
                    <Progress value={count} max={maxSpecialtyCount} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card variant="elevated" padding="lg" className="dashboard__activity">
          <h3 className="dashboard__activity-title">Recent activity</h3>
          {stats === null ? (
            error ? null : <p className="dashboard__loading">Loading…</p>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon />}
              title="No activity yet"
              description="Appointment updates will show up here."
            />
          ) : (
            <div className="dashboard__list">
              {recent.map((a) => {
                const meta = STATUS_META[a.status] ?? STATUS_META.pending
                return (
                  <DashboardListItem
                    key={a.id}
                    tone={meta.tone}
                    title={a.patient_name || 'Unnamed patient'}
                    detail={a.specialist_name || a.specialty || 'General'}
                    badgeLabel={meta.label}
                    time={formatRelativeTime(a.updated_at)}
                  />
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </PortalLayout>
  )
}

export default Dashboard
