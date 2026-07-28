import './Card.css'

const Card = ({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
  ...props
}) => {
  const classes = [
    'card',
    `card--${variant}`,
    `card--padding-${padding}`,
    onClick && 'card--clickable',
    className
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} onClick={onClick} {...props}>
      {children}
    </div>
  )
}

export default Card