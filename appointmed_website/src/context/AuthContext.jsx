import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [hospital, setHospital] = useState(null)
  const [apiKeyRow, setApiKeyRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // The user id our profile/hospital/apiKeyRow state currently, *successfully* reflects. Only
  // advances once a load succeeds for that id - a failed load (missing profile row, network
  // error, ...) never "claims" the identity, so the next attempt (e.g. retrying sign-in)
  // genuinely re-runs the fetch instead of silently short-circuiting on a bad result forever.
  const resolvedUserIdRef = useRef(undefined)

  // Bumped every time we start resolving a *new* identity. The in-flight resolution captures
  // its own generation and checks it's still the latest one before committing anything to
  // state. This stops an older, slower resolution (sign out while a sign-in's fetch is still
  // pending; manager A -> manager B on a slow link) from writing its result after a newer one
  // already has, which would otherwise pair a stale profile/hospital with the current session.
  const generationRef = useRef(0)

  // Pure fetch: no state writes, no identity bookkeeping - just returns the data or throws.
  // Keeping it pure means there's exactly one place (resolveSession, below) that decides
  // whether a result is still worth committing, instead of scattering staleness checks through
  // a function with side effects at multiple points.
  //
  // Throws on any failure, including a missing profile row: for an authenticated session that's
  // always transient/anomalous rather than a legitimate "not a manager" signal (a genuine
  // non-manager has a profile row, just with a different role - the caller can act on that once
  // it actually has one). This matters concretely for Task 2's subscribe-then-sign-in flow: the
  // profiles row may not be visible yet the instant the new manager signs in, and that must be
  // retryable, not a permanent lockout.
  const loadManagerData = useCallback(async (sess) => {
    if (!sess) return { profile: null, hospital: null, apiKeyRow: null }

    const { data: prof, error: profErr } = await supabase.from('profiles').select().eq('id', sess.user.id).maybeSingle()
    if (profErr) throw profErr
    if (!prof) throw new Error('No manager profile found for this account yet.')
    if (!prof.hospital_id) return { profile: prof, hospital: null, apiKeyRow: null }

    const [{ data: hosp, error: hospErr }, { data: keys, error: keysErr }] = await Promise.all([
      supabase.from('hospitals').select().eq('id', prof.hospital_id).maybeSingle(),
      supabase.from('hospital_api_keys').select().eq('hospital_id', prof.hospital_id)
        .eq('is_active', true).order('created_at', { ascending: false }).limit(1),
    ])
    if (hospErr) throw hospErr
    if (keysErr) throw keysErr
    return { profile: prof, hospital: hosp ?? null, apiKeyRow: keys?.[0] ?? null }
  }, [])

  // Applies an auth session to context state. For a new identity (including the very first
  // resolution on mount) this holds `loading` true across the whole fetch and commits
  // session/profile/hospital/apiKeyRow together in one go once the fetch settles, so a consumer
  // like ProtectedRoute can never observe a truthy `session` paired with a stale or mismatched
  // profile. For a same-identity event (token refresh) it only swaps in the refreshed session
  // token, so a refresh never re-fetches the profile or flashes a full-page loading state.
  const resolveSession = useCallback(async (sess) => {
    const userId = sess?.user?.id ?? null

    if (userId === resolvedUserIdRef.current) {
      setSession(sess)
      return
    }

    const generation = ++generationRef.current
    const isCurrent = () => generationRef.current === generation

    setSession(sess)
    setAuthError(null)
    setLoading(true)
    try {
      const result = await loadManagerData(sess)
      if (!isCurrent()) return // superseded while loading - the newer call owns state now
      setProfile(result.profile)
      setHospital(result.hospital)
      setApiKeyRow(result.apiKeyRow)
      resolvedUserIdRef.current = userId
    } catch (err) {
      if (!isCurrent()) return
      // Don't leave a previous user's profile/hospital showing under the new session, and
      // don't claim this identity - see resolvedUserIdRef above.
      setProfile(null)
      setHospital(null)
      setApiKeyRow(null)
      setAuthError(err)
      throw err
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [loadManagerData])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => resolveSession(data.session).catch(() => {}))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      resolveSession(sess).catch(() => {})
    })

    return () => sub.subscription.unsubscribe()
  }, [resolveSession])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new Error('Sign-in did not return a session.')
    try {
      await resolveSession(data.session)
    } catch (err) {
      // The credential check itself succeeded - we just couldn't load the manager profile
      // afterward. Tag this so callers (Landing) don't report it as a wrong password.
      err.isProfileLoadError = true
      throw err
    }
  }
  const signOut = () => supabase.auth.signOut()
  // Unlike resolveSession, this never runs for a null session in normal use (callers -
  // currently just Integration.jsx's regenerate-key flow - only reach it from an
  // authenticated screen). Guarded explicitly anyway: loadManagerData(null) resolves
  // successfully with every field null rather than throwing, so without this check a
  // stray call here would silently wipe profile/hospital/apiKeyRow instead of failing
  // loudly - worse than an error for a caller that treats a resolved promise as success.
  const refresh = async () => {
    if (!session) throw new Error('No active session to refresh.')
    const result = await loadManagerData(session)
    setProfile(result.profile)
    setHospital(result.hospital)
    setApiKeyRow(result.apiKeyRow)
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, hospital, apiKeyRow, loading, authError, signIn, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// AuthProvider + useAuth are intentionally co-located (standard React context idiom) - this
// hook export just isn't a component, which is all the Fast Refresh rule is flagging.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
