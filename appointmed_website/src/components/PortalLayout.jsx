import { Link, useNavigate } from 'react-router-dom'
import Badge from './ui/Badge'
import Logo from './ui/Logo'
import { useAuth } from '../context/AuthContext'
import './PortalLayout.css'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
  { key: 'requests', label: 'Requests', to: '/requests' },
  { key: 'integration', label: 'Integration', to: '/integration' },
  { key: 'settings', label: 'Settings', to: '/settings' },
]

export default function PortalLayout({ active, children }) {
  const navigate = useNavigate()
  const { hospital, signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="portal-layout">
      <header className="portal-layout__header">
        <div className="portal-layout__header-content">
          <div className="portal-layout__brand">
            <Logo size={40} className="portal-layout__logo" />
            <span className="portal-layout__brand-name">AppointMed</span>
          </div>

          <nav className="portal-layout__nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={`portal-layout__nav-item ${active === item.key ? 'portal-layout__nav-item--active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="portal-layout__user">
            {hospital?.name && (
              <Badge className="portal-layout__hospital-badge">{hospital.name}</Badge>
            )}
            <button className="portal-layout__logout" onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="portal-layout__main">{children}</main>
    </div>
  )
}
