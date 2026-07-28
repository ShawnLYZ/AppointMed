import './Badge.css'

const Badge = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  className = ''
}) => {
  const classes = [
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <span className={classes}>
      {icon && <span className="badge__icon">{icon}</span>}
      {children}
    </span>
  )
}

export default Badge