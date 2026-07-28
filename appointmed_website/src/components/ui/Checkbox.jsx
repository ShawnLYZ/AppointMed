import './Checkbox.css'

const Checkbox = ({
  checked = false,
  onChange,
  label,
  disabled = false,
  className = ''
}) => {
  return (
    <label className={`checkbox ${disabled ? 'checkbox--disabled' : ''} ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="checkbox__input"
      />
      <span className="checkbox__box">
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label && <span className="checkbox__label">{label}</span>}
    </label>
  )
}

export default Checkbox