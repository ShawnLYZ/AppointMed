import './Avatar.css'

const Avatar = ({
  src,
  alt = 'Avatar',
  name,
  size = 'md',
  status,
  className = ''
}) => {
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const sizeClasses = {
    xs: 'avatar--xs',
    sm: 'avatar--sm',
    md: 'avatar--md',
    lg: 'avatar--lg',
    xl: 'avatar--xl'
  }

  return (
    <div className={`avatar ${sizeClasses[size]} ${className}`}>
      {src ? (
        <img src={src} alt={alt} className="avatar__image" />
      ) : (
        <div className="avatar__initials" style={{
          background: `linear-gradient(135deg, var(--primary-400) 0%, var(--primary-600) 100%)`
        }}>
          {initials}
        </div>
      )}
      {status && (
        <span className={`avatar__status avatar__status--${status}`} />
      )}
    </div>
  )
}

export default Avatar