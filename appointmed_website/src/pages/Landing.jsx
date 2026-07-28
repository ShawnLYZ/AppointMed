import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Logo from '../components/ui/Logo'
import { useAuth } from '../context/AuthContext'
import './Landing.css'

// Mirrors the PLANS Register.jsx sends to POST /portal/subscribe (appointmed_engine's PLANS in
// src/routes/portal.ts) - kept in sync manually since the two pages don't share code.
const PRICING_PLANS = [
  { id: 'starter', name: 'Starter', priceRm: 500, specialistLimit: 'Up to 5 specialists' },
  { id: 'growth', name: 'Growth', priceRm: 1200, specialistLimit: 'Up to 20 specialists' },
  { id: 'enterprise', name: 'Enterprise', priceRm: 2500, specialistLimit: 'Unlimited specialists' }
]

const Landing = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, authError } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  // This submit attempt's own outcome (wrong password, or signed-in-but-profile-load-failed) -
  // separate from the boundary-derived message below so the two can't fight each other.
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Flips true the moment a submit is attempted, permanently suppressing the boundary-
  // derived message below for the rest of this mount - see boundaryError.
  const [boundaryDismissed, setBoundaryDismissed] = useState(false)

  // Derived fresh every render (no effect, no local copy that can go stale) from either a
  // ProtectedRoute redirect reason (see ProtectedRoute.jsx - distinguishes "wrong role" from
  // "profile failed to load") or authError arriving straight from context, for when a
  // lingering session fails to (re)resolve while this tab is already sitting on the sign-in
  // screen rather than via a redirect at all. Suppressed by boundaryDismissed once the user
  // has made their own attempt, so it can never resurface mid-flight over a fresh, unrelated
  // submit - only a brand new bounce (a fresh mount, with its own fresh reason) shows it again.
  const reason = location.state?.reason
  const boundaryError = boundaryDismissed
    ? ''
    : reason === 'not-manager'
    ? "This account isn't a hospital manager."
    : reason === 'profile-error' || authError
    ? "We couldn't load your manager profile. Please try again."
    : ''

  const error = submitError || boundaryError

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setBoundaryDismissed(true)
    setSubmitting(true)
    try {
      await signIn(formData.email, formData.password)
      navigate('/dashboard')
    } catch (err) {
      // Sign-in itself can succeed and still fail to load a manager profile afterward (see
      // AuthContext.signIn) - that's not a bad password, so don't tell the user it is.
      setSubmitError(
        err?.isProfileLoadError
          ? "Signed in, but couldn't load your manager profile. Please try again."
          : 'Incorrect email or password.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="landing">
      {/* Hero Background */}
      <div className="landing__bg">
        <div className="landing__bg-gradient" />
        <div className="landing__bg-pattern" />
        <div className="landing__bg-shapes">
          <div className="shape shape--1" />
          <div className="shape shape--2" />
          <div className="shape shape--3" />
        </div>
      </div>

      {/* Content */}
      <div className="landing__content">
        {/* Left Side - Marketing */}
        <div className="landing__hero">
          <div className="landing__brand animate-slide-up stagger-1">
            <Logo size={48} className="landing__logo" />
            <span className="landing__brand-name">AppointMed</span>
          </div>

          <h1 className="landing__title animate-slide-up stagger-2">
            One AI Chat.<br />
            <span className="landing__title-accent">Every Hospital.</span>
          </h1>

          <p className="landing__subtitle animate-slide-up stagger-3">
            Connect your hospital to the future of patient engagement.
            Let AI handle appointment bookings while you focus on care.
          </p>

          <div className="landing__features animate-slide-up stagger-4">
            <div className="landing__feature">
              <div className="landing__feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.17-8.73"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <span>AI-Powered Booking</span>
            </div>
            <div className="landing__feature">
              <div className="landing__feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
              </div>
              <span>Real-time Availability</span>
            </div>
            <div className="landing__feature">
              <div className="landing__feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <span>Secure Integration</span>
            </div>
          </div>

          <div className="landing__stats animate-slide-up stagger-5">
            <div className="landing__stat">
              <span className="landing__stat-value">AI</span>
              <span className="landing__stat-label">Symptom triage</span>
            </div>
            <div className="landing__stat-divider" />
            <div className="landing__stat">
              <span className="landing__stat-value">Live</span>
              <span className="landing__stat-label">Hospital-confirmed</span>
            </div>
            <div className="landing__stat-divider" />
            <div className="landing__stat">
              <span className="landing__stat-value">Instant</span>
              <span className="landing__stat-label">API activation</span>
            </div>
          </div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="landing__auth animate-slide-up stagger-3" id="signin">
          <Card variant="elevated" padding="lg" className="landing__auth-card">
            <div className="landing__auth-header">
              <h2 className="landing__auth-title">Welcome Back</h2>
              <p className="landing__auth-subtitle">Sign in to manage your hospital</p>
            </div>

            <form onSubmit={handleSubmit} className="landing__form">
              <Input
                label="Email Address"
                type="email"
                placeholder="manager@hospital.com"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                }
              />

              <Input
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
                error={error}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                }
              />

              <Button type="submit" size="lg" fullWidth loading={submitting}>
                Sign In
              </Button>
            </form>

            <div className="landing__auth-switch">
              <span>Don't have an account?</span>
              <button
                type="button"
                className="landing__auth-link"
                onClick={() => navigate('/register')}
              >
                Register Hospital
              </button>
            </div>
          </Card>

          <p className="landing__terms">
            By continuing, you agree to our{' '}
            <a href="#">Terms of Service</a> and{' '}
            <a href="#">Privacy Policy</a>
          </p>
        </div>
      </div>

      {/* What Patients Get */}
      <div className="landing__patients">
        <div className="landing__section-header">
          <h2 className="landing__section-title">What patients get</h2>
          <p className="landing__section-subtitle">
            Every hospital on AppointMed gives patients the same AI-powered booking experience,
            from first symptom to confirmed appointment.
          </p>
        </div>

        <div className="landing__patient-cards">
          <Card variant="elevated" padding="lg" className="landing__patient-card">
            <div className="landing__patient-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <h3 className="landing__patient-card-title">
              AI symptom triage with photo/PDF understanding
            </h3>
            <p className="landing__patient-card-desc">
              Patients describe what's wrong in a natural chat — attaching photos or PDF reports
              when it helps — and the AI asks the right follow-up questions before recommending a
              specialist.
            </p>
          </Card>

          <Card variant="elevated" padding="lg" className="landing__patient-card">
            <div className="landing__patient-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <h3 className="landing__patient-card-title">
              Preference-aware matching across hospitals
            </h3>
            <p className="landing__patient-card-desc">
              Budget, preferred hospital, and timing all factor into the match, so patients are
              paired with the right specialist and slot across your whole network — not just
              whichever is first available.
            </p>
          </Card>

          <Card variant="elevated" padding="lg" className="landing__patient-card">
            <div className="landing__patient-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.17-8.73" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 className="landing__patient-card-title">Live hospital-confirmed bookings</h3>
            <p className="landing__patient-card-desc">
              Every request lands in your queue in real time and only becomes an appointment once
              your team confirms it — the patient's app updates the moment you do.
            </p>
          </Card>
        </div>
      </div>

      {/* How Hospitals Subscribe */}
      <div className="landing__steps">
        <div className="landing__section-header">
          <h2 className="landing__section-title">How hospitals subscribe</h2>
          <p className="landing__section-subtitle">
            From registration to a live booking queue, with no manual back-and-forth.
          </p>
        </div>

        <div className="landing__steps-strip">
          <div className="landing__step">
            <div className="landing__step-number">1</div>
            <h3 className="landing__step-title">Register</h3>
            <p className="landing__step-desc">
              Tell us about your hospital — name, address, and working hours.
            </p>
          </div>

          <div className="landing__step-connector" aria-hidden="true">→</div>

          <div className="landing__step">
            <div className="landing__step-number">2</div>
            <h3 className="landing__step-title">Choose plan &amp; pay</h3>
            <p className="landing__step-desc">
              Pick Starter, Growth, or Enterprise and add your billing details.
            </p>
          </div>

          <div className="landing__step-connector" aria-hidden="true">→</div>

          <div className="landing__step">
            <div className="landing__step-number">3</div>
            <h3 className="landing__step-title">Instantly activated with API key</h3>
            <p className="landing__step-desc">
              Your hospital goes live immediately, ready to receive booking requests.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="landing__pricing">
        <div className="landing__section-header">
          <h2 className="landing__section-title">Pricing</h2>
          <p className="landing__section-subtitle">
            One flat monthly fee per tier, plus a 3% fee per booking. No setup costs.
          </p>
        </div>

        <div className="landing__pricing-cards">
          {PRICING_PLANS.map((plan) => (
            <Card key={plan.id} variant="elevated" padding="lg" className="landing__pricing-card">
              <h3 className="landing__pricing-name">{plan.name}</h3>
              <p className="landing__pricing-price">
                RM {plan.priceRm.toLocaleString('en-MY')}<span>/month</span>
              </p>
              <p className="landing__pricing-fee">+3% per booking</p>
              <p className="landing__pricing-limit">{plan.specialistLimit}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div className="landing__cta">
        <Card variant="elevated" padding="lg" className="landing__cta-card">
          <h2 className="landing__cta-title">Ready to bring AI booking to your hospital?</h2>
          <p className="landing__cta-subtitle">
            Registration takes a few minutes, and your API key is ready the moment you subscribe.
          </p>
          <div className="landing__cta-actions">
            <Button size="lg" onClick={() => navigate('/register')}>
              Register Hospital
            </Button>
            <a href="#signin" className="btn btn--secondary btn--lg">Sign In</a>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Landing