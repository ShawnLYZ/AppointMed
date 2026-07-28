import './Progress.css'

const Progress = ({
  value = 0,
  max = 100,
  size = 'md',
  variant = 'primary',
  showLabel = false,
  className = ''
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  return (
    <div className={`progress progress--${size} progress--${variant} ${className}`}>
      <div className="progress__track">
        <div
          className="progress__fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="progress__label">{Math.round(percentage)}%</span>
      )}
    </div>
  )
}

export default Progress