import './Stepper.css'

const Stepper = ({ steps, currentStep = 0, className = '' }) => {
  return (
    <div className={`stepper ${className}`}>
      <div className="stepper__steps">
        {steps.map((step, index) => {
          const isActive = index === currentStep
          const isCompleted = index < currentStep
          const isLast = index === steps.length - 1

          return (
            <div key={index} className="stepper__step">
              <div className="stepper__step-header">
                <div
                  className={`stepper__step-number ${
                    isActive ? 'stepper__step-number--active' : ''
                  } ${isCompleted ? 'stepper__step-number--completed' : ''}`}
                >
                  {isCompleted ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                {!isLast && (
                  <div className={`stepper__step-line ${isCompleted ? 'stepper__step-line--completed' : ''}`} />
                )}
              </div>
              <div className="stepper__step-content">
                <span className={`stepper__step-title ${isActive ? 'stepper__step-title--active' : ''}`}>
                  {step.title}
                </span>
                {step.description && (
                  <span className="stepper__step-description">{step.description}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Stepper