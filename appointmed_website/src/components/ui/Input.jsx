import { forwardRef, useState } from 'react'
import './Input.css'

const Input = forwardRef(({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  helperText,
  icon,
  iconPosition = 'left',
  disabled = false,
  required = false,
  className = '',
  id,
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false)
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div className={`input-wrapper ${className}`}>
      {label && (
        <label htmlFor={inputId} className="input__label">
          {label}
          {required && <span className="input__required">*</span>}
        </label>
      )}
      <div className={`input-container ${focused ? 'input-container--focused' : ''} ${error ? 'input-container--error' : ''} ${disabled ? 'input-container--disabled' : ''}`}>
        {icon && iconPosition === 'left' && (
          <span className="input__icon input__icon--left">{icon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className="input__field"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {icon && iconPosition === 'right' && (
          <span className="input__icon input__icon--right">{icon}</span>
        )}
      </div>
      {(error || helperText) && (
        <span className={`input__helper ${error ? 'input__helper--error' : ''}`}>
          {error || helperText}
        </span>
      )}
    </div>
  )
})

Input.displayName = 'Input'

export default Input