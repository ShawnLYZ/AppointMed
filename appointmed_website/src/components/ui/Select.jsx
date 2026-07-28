import { useState, useRef, useEffect } from 'react'
import './Select.css'

const Select = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  error,
  disabled = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectRef = useRef(null)

  const selectedOption = options.find(opt => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`select-wrapper ${className}`}>
      {label && (
        <label className="select__label">
          {label}
        </label>
      )}
      <div
        ref={selectRef}
        className={`select ${isOpen ? 'select--open' : ''} ${error ? 'select--error' : ''} ${disabled ? 'select--disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="select__value">
          {selectedOption ? (
            <span className="select__selected">{selectedOption.label}</span>
          ) : (
            <span className="select__placeholder">{placeholder}</span>
          )}
        </div>
        <div className="select__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        {isOpen && (
          <div className="select__dropdown">
            {options.map((option) => (
              <div
                key={option.value}
                className={`select__option ${value === option.value ? 'select__option--selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(option.value)
                  setIsOpen(false)
                }}
              >
                {option.icon && <span className="select__option-icon">{option.icon}</span>}
                <span className="select__option-label">{option.label}</span>
                {option.description && (
                  <span className="select__option-desc">{option.description}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <span className="select__error">{error}</span>}
    </div>
  )
}

export default Select