import logoUrl from '../../assets/logo.png'
import './Logo.css'

/**
 * The AppointMed brand mark. Same artwork as the favicon and the patient
 * app's launcher icon, so the two products read as one product.
 */
const Logo = ({ size = 40, className = '', alt = 'AppointMed' }) => (
  <img
    src={logoUrl}
    alt={alt}
    width={size}
    height={size}
    className={['logo', className].filter(Boolean).join(' ')}
    style={{ width: size, height: size }}
  />
)

export default Logo
