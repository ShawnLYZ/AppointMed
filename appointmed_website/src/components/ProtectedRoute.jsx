import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="app__loading">Loading…</div>
  if (!session) return <Navigate to="/" replace />

  // A truthy session with no profile always means AuthContext's loadManagerData failed for
  // this identity (see resolveSession's catch block) - a genuine non-manager still gets a
  // profile row back, just with the wrong role, so "no profile at all" unambiguously means
  // "couldn't load it", never "you're not a manager". Landing reads this reason (plus
  // AuthContext's authError directly, for when it's already sitting on "/" while a load
  // fails) so the bounce back here is explained instead of silent.
  if (!profile) return <Navigate to="/" replace state={{ reason: 'profile-error' }} />
  if (profile.role !== 'hospital_manager') return <Navigate to="/" replace state={{ reason: 'not-manager' }} />
  return children
}
