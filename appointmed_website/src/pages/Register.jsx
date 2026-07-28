import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Stepper from '../components/ui/Stepper'
import Upload from '../components/ui/Upload'
import Checkbox from '../components/ui/Checkbox'
import Logo from '../components/ui/Logo'
import { useAuth } from '../context/AuthContext'
import { engine } from '../lib/engine'
import { supabase } from '../lib/supabase'
import './Register.css'

const PLANS = [
  { id: 'starter', name: 'Starter', priceRm: 500, specialistLimit: 'Up to 5 specialists' },
  { id: 'growth', name: 'Growth', priceRm: 1200, specialistLimit: 'Up to 20 specialists' },
  { id: 'enterprise', name: 'Enterprise', priceRm: 2500, specialistLimit: 'Unlimited specialists' }
]

const STEPS = [
  { title: 'Manager Info', description: 'Personal details' },
  { title: 'Hospital Info', description: 'Location & hours' },
  { title: 'Plan & Billing', description: 'Choose your tier' },
  { title: 'Documents', description: 'Upload files' },
  { title: 'Review', description: 'Confirm & submit' }
]

const DOCUMENT_TYPES = [
  {
    slot: 'license',
    title: 'Hospital License',
    description: 'Official hospital operating license',
    uploadLabel: 'Upload License',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    )
  },
  {
    slot: 'certificate',
    title: 'Registration Certificate',
    description: 'Hospital registration document',
    uploadLabel: 'Upload Certificate',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <path d="M3 10h18"/>
        <path d="M7 15h4"/>
      </svg>
    )
  },
  {
    slot: 'id',
    title: 'Manager ID',
    description: 'Passport or national ID scan',
    uploadLabel: 'Upload ID',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    )
  }
]

// Single source of truth for the match rule and its message, shared by validateStep's
// Next-blocking check and ManagerInfoStep's live display below - previously each re-implemented
// `password !== confirmPassword` independently, which agreed today but could silently desync if
// the rule ever changed in only one place.
const PASSWORD_MISMATCH_MESSAGE = 'Passwords do not match'
const passwordsMismatch = (password, confirmPassword) => confirmPassword !== password

// Deliberately permissive (not a full RFC 5322 validator) - just enough to catch an obvious
// typo before it reaches supabase.auth.admin.createUser and comes back as an opaque 500
// auth_failed (see handleSubmit's err.code branches below).
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ManagerInfoStep = ({ formData, errors, setField }) => {
  // Once something has been typed into confirmPassword, compare live against the current
  // password rather than trusting errors.confirmPassword - that field is only refreshed when
  // Next is clicked, so after a blocked attempt it would otherwise keep showing "Passwords do
  // not match" even once the user fixes it by editing the *password* field back into agreement
  // (setField only clears the error for the field it was called with). errors.confirmPassword
  // is still the right source while the field is empty - "required" has no live check to fall
  // back to, and emptiness doesn't depend on any other field so it can't go stale the same way.
  const confirmPasswordError = formData.confirmPassword
    ? (passwordsMismatch(formData.password, formData.confirmPassword) ? PASSWORD_MISMATCH_MESSAGE : '')
    : (errors.confirmPassword || '')

  return (
    <div className="register__step">
      <h3 className="register__step-title">Manager Information</h3>
      <p className="register__step-desc">
        Please provide your personal details for verification.
      </p>
      <div className="register__fields">
        <Input
          label="Full Name"
          placeholder="Enter your full name"
          value={formData.fullName}
          onChange={(e) => setField('fullName', e.target.value)}
          error={errors.fullName}
          required
        />
        <Input
          label="Passport Number"
          placeholder="Enter your passport number"
          value={formData.passportNumber}
          onChange={(e) => setField('passportNumber', e.target.value)}
          error={errors.passportNumber}
          required
        />
        <Input
          label="Phone Number"
          type="tel"
          placeholder="+60 12 345 6789"
          value={formData.phoneNumber}
          onChange={(e) => setField('phoneNumber', e.target.value)}
          error={errors.phoneNumber}
          required
        />
        <Input
          label="Email Address"
          type="email"
          placeholder="manager@hospital.com"
          value={formData.email}
          onChange={(e) => setField('email', e.target.value)}
          error={errors.email}
          required
        />
        <Input
          label="Password"
          type="password"
          placeholder="Minimum 8 characters"
          value={formData.password}
          onChange={(e) => setField('password', e.target.value)}
          error={errors.password}
          required
        />
        <Input
          label="Confirm Password"
          type="password"
          placeholder="Re-enter your password"
          value={formData.confirmPassword}
          onChange={(e) => setField('confirmPassword', e.target.value)}
          error={confirmPasswordError}
          required
        />
      </div>
    </div>
  )
}

const HospitalInfoStep = ({ formData, errors, setField, updateWorkingHours }) => (
  <div className="register__step">
    <h3 className="register__step-title">Hospital Information</h3>
    <p className="register__step-desc">
      Tell us about your hospital and operating hours.
    </p>
    <div className="register__fields">
      <Input
        label="Hospital Name"
        placeholder="Enter hospital name"
        value={formData.hospitalName}
        onChange={(e) => setField('hospitalName', e.target.value)}
        error={errors.hospitalName}
        required
      />
      <Input
        label="Address"
        placeholder="Enter full address"
        value={formData.address}
        onChange={(e) => setField('address', e.target.value)}
        error={errors.address}
        required
      />

      <div className="register__hours">
        <label className="register__hours-label">Working Hours</label>
        <div className="register__hours-grid">
          {Object.entries(formData.workingHours).map(([day, hours]) => (
            <div key={day} className="register__hours-row">
              <div className="register__hours-day">
                <Checkbox
                  checked={!hours.closed}
                  onChange={(checked) => updateWorkingHours(day, { closed: !checked })}
                />
                <span className="register__hours-day-name">
                  {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                </span>
              </div>
              {!hours.closed ? (
                <div className="register__hours-time">
                  <input
                    type="time"
                    value={hours.open}
                    onChange={(e) => updateWorkingHours(day, { open: e.target.value })}
                    className="register__time-input"
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={hours.close}
                    onChange={(e) => updateWorkingHours(day, { close: e.target.value })}
                    className="register__time-input"
                  />
                </div>
              ) : (
                <span className="register__hours-closed">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)

const PlanBillingStep = ({ formData, errors, setField, setBillingField }) => (
  <div className="register__step">
    <h3 className="register__step-title">Plan & Billing</h3>
    <p className="register__step-desc">
      Choose the plan that fits your hospital, then add payment details.
    </p>

    <div className="register__plans">
      {PLANS.map((plan) => {
        const isSelected = formData.plan === plan.id
        return (
          <Card
            key={plan.id}
            variant="elevated"
            padding="lg"
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => setField('plan', plan.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setField('plan', plan.id)
              }
            }}
            className={`register__plan ${isSelected ? 'register__plan--selected' : ''}`}
          >
            <h4 className="register__plan-name">{plan.name}</h4>
            <p className="register__plan-price">
              RM {plan.priceRm.toLocaleString('en-MY')}<span>/month</span>
            </p>
            <p className="register__plan-fee">+3% per booking</p>
            <p className="register__plan-limit">{plan.specialistLimit}</p>
          </Card>
        )
      })}
    </div>

    <div className="register__billing">
      <h4 className="register__billing-title">Payment Details</h4>
      <p className="register__billing-note">
        Payment is simulated for this demo — no charge is made.
      </p>
      <div className="register__fields">
        <Input
          label="Cardholder Name"
          placeholder="Name as it appears on card"
          value={formData.billing.cardholder}
          onChange={(e) => setBillingField('cardholder', e.target.value)}
          error={errors.cardholder}
          required
        />
        <Input
          label="Card Number"
          placeholder="1234 5678 9012 3456"
          value={formData.billing.cardNumber}
          onChange={(e) => setBillingField('cardNumber', e.target.value)}
          error={errors.cardNumber}
          required
        />
        <Input
          label="Expiry Date"
          placeholder="MM/YY"
          value={formData.billing.expiry}
          onChange={(e) => setBillingField('expiry', e.target.value)}
          error={errors.expiry}
          required
        />
        <Input
          label="CVC"
          placeholder="123"
          value={formData.billing.cvc}
          onChange={(e) => setBillingField('cvc', e.target.value)}
          error={errors.cvc}
          required
        />
      </div>
    </div>
  </div>
)

const DocumentsStep = ({ onUpdateSlot }) => (
  <div className="register__step">
    <h3 className="register__step-title">Upload Documents</h3>
    <p className="register__step-desc">
      Upload the required documents for verification.
    </p>

    <div className="register__documents">
      {DOCUMENT_TYPES.map((doc) => (
        <div key={doc.slot} className="register__document-item">
          <div className="register__document-header">
            <div className="register__document-icon">{doc.icon}</div>
            <div>
              <h4>{doc.title}</h4>
              <p>{doc.description}</p>
            </div>
          </div>
          <Upload
            label={doc.uploadLabel}
            description="PDF, JPG, PNG (max 10MB)"
            onFiles={(files) => onUpdateSlot(doc.slot, files)}
          />
        </div>
      ))}
    </div>
  </div>
)

const ReviewStep = ({ formData, selectedPlan, onEditStep, onConfirmChange, submitError }) => (
  <div className="register__step">
    <h3 className="register__step-title">Review & Submit</h3>
    <p className="register__step-desc">
      Please verify all information before submitting.
    </p>

    <div className="register__review">
      <div className="register__review-section">
        <div className="register__review-header">
          <h4>Manager Information</h4>
          <button className="register__review-edit" onClick={() => onEditStep(0)}>Edit</button>
        </div>
        <div className="register__review-grid">
          <div className="register__review-item">
            <span className="register__review-label">Full Name</span>
            <span className="register__review-value">{formData.fullName || '—'}</span>
          </div>
          <div className="register__review-item">
            <span className="register__review-label">Passport</span>
            <span className="register__review-value">{formData.passportNumber || '—'}</span>
          </div>
          <div className="register__review-item">
            <span className="register__review-label">Phone</span>
            <span className="register__review-value">{formData.phoneNumber || '—'}</span>
          </div>
          <div className="register__review-item">
            <span className="register__review-label">Email</span>
            <span className="register__review-value">{formData.email || '—'}</span>
          </div>
        </div>
      </div>

      <div className="register__review-section">
        <div className="register__review-header">
          <h4>Hospital Information</h4>
          <button className="register__review-edit" onClick={() => onEditStep(1)}>Edit</button>
        </div>
        <div className="register__review-grid">
          <div className="register__review-item">
            <span className="register__review-label">Hospital Name</span>
            <span className="register__review-value">{formData.hospitalName || '—'}</span>
          </div>
          <div className="register__review-item">
            <span className="register__review-label">Address</span>
            <span className="register__review-value">{formData.address || '—'}</span>
          </div>
          <div className="register__review-item register__review-item--full">
            <span className="register__review-label">Working Hours</span>
            <div className="register__review-hours">
              {Object.entries(formData.workingHours).map(([day, hours]) => (
                <span key={day} className="register__review-hour">
                  {hours.closed
                    ? `${day.slice(0,3)}: Closed`
                    : `${day.slice(0,3)}: ${hours.open} - ${hours.close}`
                  }
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="register__review-section">
        <div className="register__review-header">
          <h4>Plan & Billing</h4>
          <button className="register__review-edit" onClick={() => onEditStep(2)}>Edit</button>
        </div>
        <div className="register__review-grid">
          <div className="register__review-item">
            <span className="register__review-label">Plan</span>
            <span className="register__review-value">
              {selectedPlan ? `${selectedPlan.name} (RM ${selectedPlan.priceRm.toLocaleString('en-MY')}/month + 3% per booking)` : '—'}
            </span>
          </div>
          <div className="register__review-item">
            <span className="register__review-label">Cardholder</span>
            <span className="register__review-value">{formData.billing.cardholder || '—'}</span>
          </div>
          <div className="register__review-item">
            <span className="register__review-label">Card Number</span>
            <span className="register__review-value">
              {formData.billing.cardNumber ? `•••• ${formData.billing.cardNumber.slice(-4)}` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="register__review-section">
        <div className="register__review-header">
          <h4>Documents</h4>
          <button className="register__review-edit" onClick={() => onEditStep(3)}>Edit</button>
        </div>
        <div className="register__review-docs">
          <span className="register__review-docs-note">
            {formData.documents.length > 0
              ? `${formData.documents.length} document${formData.documents.length > 1 ? 's' : ''} ready to upload: ${formData.documents.map((f) => f.name).join(', ')}`
              : 'No documents uploaded yet'}
          </span>
        </div>
      </div>
    </div>

    <div className="register__confirm">
      <Checkbox
        checked={formData.confirmInfo}
        onChange={onConfirmChange}
        label="I confirm that all information provided is accurate and complete"
      />
    </div>

    {submitError && (
      <div className="register__submit-error">{submitError}</div>
    )}
  </div>
)

const Register = () => {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [apiKey, setApiKey] = useState(null)
  const [hasSession, setHasSession] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [copied, setCopied] = useState(false)
  const [errors, setErrors] = useState({})
  // Each Upload slot reports its own current file list independently; keying by slot (rather than
  // concatenating whatever each onFiles call reports) is what lets replacing one slot's file
  // replace just that slot's entry in formData.documents instead of accumulating duplicates.
  const [documentSlots, setDocumentSlots] = useState({ license: [], certificate: [], id: [] })
  const [formData, setFormData] = useState({
    // Step 1 - Manager Info
    fullName: '',
    passportNumber: '',
    phoneNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    // Step 2 - Hospital Info
    hospitalName: '',
    address: '',
    workingHours: {
      monday: { open: '08:00', close: '17:00', closed: false },
      tuesday: { open: '08:00', close: '17:00', closed: false },
      wednesday: { open: '08:00', close: '17:00', closed: false },
      thursday: { open: '08:00', close: '17:00', closed: false },
      friday: { open: '08:00', close: '17:00', closed: false },
      saturday: { open: '09:00', close: '13:00', closed: false },
      sunday: { open: '09:00', close: '13:00', closed: true }
    },
    // Step 3 - Plan & Billing
    plan: 'starter',
    billing: { cardholder: '', cardNumber: '', expiry: '', cvc: '' },
    // Step 4 - Documents
    documents: [],
    // Step 5 - Review
    confirmInfo: false
  })

  const selectedPlan = PLANS.find((p) => p.id === formData.plan)

  // Shared updater for top-level scalar fields: applies the edit and clears any stale
  // validation error for that field so fixing a field un-blocks Next without another click.
  const setField = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const setBillingField = (key, value) => {
    setFormData((prev) => ({ ...prev, billing: { ...prev.billing, [key]: value } }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const updateWorkingHours = (day, patch) => {
    setFormData((prev) => ({
      ...prev,
      workingHours: { ...prev.workingHours, [day]: { ...prev.workingHours[day], ...patch } }
    }))
  }

  const updateDocumentSlot = (slot, files) => {
    const next = { ...documentSlots, [slot]: files }
    setDocumentSlots(next)
    setFormData((prev) => ({ ...prev, documents: [...next.license, ...next.certificate, ...next.id] }))
  }

  const validateStep = (step) => {
    const errs = {}
    if (step === 0) {
      if (!formData.fullName.trim()) errs.fullName = 'Full name is required'
      if (!formData.passportNumber.trim()) errs.passportNumber = 'Passport number is required'
      if (!formData.phoneNumber.trim()) errs.phoneNumber = 'Phone number is required'
      if (!formData.email.trim()) errs.email = 'Email address is required'
      else if (!EMAIL_FORMAT_RE.test(formData.email.trim())) errs.email = 'Enter a valid email address'
      if (!formData.password) errs.password = 'Password is required'
      else if (formData.password.length < 8) errs.password = 'Password must be at least 8 characters'
      if (!formData.confirmPassword) errs.confirmPassword = 'Please confirm your password'
      else if (passwordsMismatch(formData.password, formData.confirmPassword)) errs.confirmPassword = PASSWORD_MISMATCH_MESSAGE
    } else if (step === 1) {
      if (!formData.hospitalName.trim()) errs.hospitalName = 'Hospital name is required'
      if (!formData.address.trim()) errs.address = 'Address is required'
    } else if (step === 2) {
      if (!formData.billing.cardholder.trim()) errs.cardholder = 'Cardholder name is required'
      const cardDigits = formData.billing.cardNumber.replace(/\s+/g, '')
      if (!cardDigits) errs.cardNumber = 'Card number is required'
      else if (!/^\d{16}$/.test(cardDigits)) errs.cardNumber = 'Enter a valid 16-digit card number'
      if (!formData.billing.expiry.trim()) errs.expiry = 'Expiry date is required'
      if (!formData.billing.cvc.trim()) errs.cvc = 'CVC is required'
    }
    return errs
  }

  const handleNext = () => {
    const stepErrors = validateStep(currentStep)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setErrors({})
      setCurrentStep(currentStep - 1)
    }
  }

  const handleCopyApiKey = () => {
    if (!apiKey) return
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    let result
    try {
      result = await engine.subscribe({
        hospital: {
          name: formData.hospitalName,
          address: formData.address,
          workingHours: formData.workingHours
        },
        plan: formData.plan,
        manager: {
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          phone: formData.phoneNumber
        },
        billing: {
          cardholder: formData.billing.cardholder,
          cardLast4: formData.billing.cardNumber.slice(-4)
        }
      })
    } catch (err) {
      // engine.js's json() attaches .code from the response body's {error} field for any
      // non-2xx response; a fetch-level failure (engine unreachable) leaves .code
      // undefined, so that's the only case left to blame on the engine not running.
      if (err.code === 'email_in_use') {
        setSubmitError('This email is already registered. Sign in instead.')
      } else if (err.code === 'auth_failed') {
        setSubmitError(
          "We couldn't create your account. This can happen if your password doesn't meet security requirements — try a different password, or try again in a moment."
        )
      } else if (err.code === 'invalid_subscription') {
        setSubmitError('Some required information is missing or invalid. Please review each step and try again.')
      } else {
        setSubmitError('Subscription failed. Is the AppointMed engine running?')
      }
      setIsSubmitting(false)
      return
    }

    // engine.subscribe already returned 201 here: the hospital, manager account, subscription,
    // API key and starter specialists all exist now and are permanent. Nothing below may be
    // reported as a failed subscription - a sign-in or upload problem past this point only
    // degrades what the success screen can offer, it never undoes what already happened.
    try {
      const messages = []
      let signedIn = false
      try {
        await signIn(formData.email, formData.password)
        signedIn = true
      } catch {
        messages.push(
          "We couldn't sign you in automatically, but your hospital and account were created successfully. Sign in from the home page to continue."
        )
      }

      if (formData.documents.length > 0) {
        // Not gated on `signedIn`: signIn() is compound (credential check, then load the manager
        // profile), and only the second half is what races right after subscribe creates the
        // account (see AuthContext.loadManagerData's comment). signInWithPassword itself already
        // fully establishes a real Supabase-client session - with a valid access token - before
        // that second half can fail, so a thrown signIn() does not mean no token exists. Check
        // for a session directly instead of assuming one from whether signIn() succeeded.
        try {
          const { data } = await supabase.auth.getSession()
          if (!data.session) {
            messages.push(
              'Your verification documents were not uploaded because no session could be established. Sign in, then upload them from the portal.'
            )
          } else {
            await engine.uploadVerificationDocs(formData.documents, data.session.access_token)
          }
        } catch {
          messages.push(
            'Your verification documents could not be uploaded. You can upload them again later from the portal.'
          )
        }
      }

      setApiKey(result.apiKey)
      setHasSession(signedIn)
      setWarnings(messages)
      setIsSuccess(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <ManagerInfoStep formData={formData} errors={errors} setField={setField} />
      case 1:
        return (
          <HospitalInfoStep
            formData={formData}
            errors={errors}
            setField={setField}
            updateWorkingHours={updateWorkingHours}
          />
        )
      case 2:
        return (
          <PlanBillingStep
            formData={formData}
            errors={errors}
            setField={setField}
            setBillingField={setBillingField}
          />
        )
      case 3:
        return <DocumentsStep onUpdateSlot={updateDocumentSlot} />
      case 4:
        return (
          <ReviewStep
            formData={formData}
            selectedPlan={selectedPlan}
            onEditStep={setCurrentStep}
            onConfirmChange={(checked) => setField('confirmInfo', checked)}
            submitError={submitError}
          />
        )
      default:
        return null
    }
  }

  if (isSuccess) {
    return (
      <div className="register">
        <div className="register__bg" />
        <div className="register__container">
          <Card variant="elevated" padding="xl" className="register__success">
            <div className="register__success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.17-8.73"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="register__success-title">You're Activated!</h2>
            <p className="register__success-desc">
              <strong>{formData.hospitalName || 'Your hospital'}</strong> is now live on AppointMed.
              Save your API key below to connect your hospital systems.
            </p>

            <div className="register__apikey">
              <span className="register__apikey-label">Your API Key</span>
              <div className="register__apikey-row">
                <code className="register__apikey-value">{apiKey}</code>
                <Button variant="secondary" size="sm" onClick={handleCopyApiKey}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <span className="register__apikey-hint">
                Keep this safe — also visible under Integration.
              </span>
            </div>

            {warnings.length > 0 && (
              <div className="register__degraded">
                <h4 className="register__degraded-title">A few things need your attention</h4>
                <ul className="register__degraded-list">
                  {warnings.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="register__success-actions">
              {hasSession ? (
                <Button onClick={() => navigate('/dashboard')} variant="primary" size="lg">
                  Go to Dashboard
                </Button>
              ) : (
                <Button onClick={() => navigate('/')} variant="primary" size="lg">
                  Go to Sign In
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="register">
      <div className="register__bg" />
      <div className="register__container">
        <button className="register__back" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Home
        </button>

        <div className="register__header">
          <Logo size={56} className="register__logo" />
          <h1 className="register__title">Register Your Hospital</h1>
          <p className="register__subtitle">
            Join AppointMed and start accepting AI-powered appointment bookings
          </p>
        </div>

        <Stepper steps={STEPS} currentStep={currentStep} />

        <Card variant="elevated" padding="lg" className="register__form-card">
          {renderStepContent()}

          <div className="register__actions">
            {currentStep > 0 && (
              <Button variant="secondary" onClick={handleBack}>
                Back
              </Button>
            )}
            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext}>
                Continue
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={!formData.confirmInfo}
              >
                Submit Application
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Register
