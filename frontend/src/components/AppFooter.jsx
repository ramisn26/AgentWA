import { Facebook, Instagram, Globe } from 'lucide-react';
import { C, FONT, BRAND_FONT } from '../constants.js';
import { BRAND } from '../brand.js';

// WhatsApp glyph (lucide ships no WhatsApp icon) — drawn to match lucide's
// 2px stroke style so it sits evenly beside the other social icons.
function WhatsAppIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 20.5l1.3-4.1A8.5 8.5 0 1 1 8 19.4z" />
      <path d="M9.2 8.6c.2-.5.6-.6.9-.6h.5c.2 0 .4.1.5.4l.7 1.7c.1.2 0 .5-.1.6l-.6.7c-.1.2-.1.4 0 .6.6 1 1.4 1.8 2.4 2.3.2.1.4.1.6 0l.7-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.3.3.3.5v.4c0 .4-.2.8-.6 1-.6.3-1.4.4-2.3.1-2.3-.7-4.3-2.6-5.1-4.9-.3-.9-.2-1.6 0-2z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICONS = {
  facebook: (p) => <Facebook size={15} {...p} />,
  instagram: (p) => <Instagram size={15} {...p} />,
  whatsapp: () => <WhatsAppIcon />,
  website: (p) => <Globe size={15} {...p} />,
};

const linkStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 8, color: 'var(--c-onNavyMuted)',
  transition: 'color .15s, background .15s',
};

// Slim brand footer used across the app shell and the sign-in screen.
export default function AppFooter() {
  return (
    <footer style={{
      height: 40, flexShrink: 0, background: C.navy, color: C.onNavyMuted,
      display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px 0 18px',
      fontFamily: FONT, fontSize: 12,
    }}>
      <a href={BRAND.website} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.onNavyMuted, textDecoration: 'none', minWidth: 0 }}>
        <img src={BRAND.mark} alt="" style={{ height: 16, width: 'auto' }} />
        <span style={{ whiteSpace: 'nowrap' }}>
          Powered by{' '}
          <span style={{ fontFamily: BRAND_FONT, fontWeight: 700, color: C.onNavy }}>{BRAND.poweredBy}</span>
        </span>
      </a>
      <span className="pr-footer-copy" style={{ whiteSpace: 'nowrap', opacity: .7 }}>
        © {new Date().getFullYear()} {BRAND.name}
      </span>
      <div style={{ flex: 1 }} />
      <nav aria-label="PaviRami AI on social media" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {BRAND.socials.map(s => (
          <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
            title={s.label} aria-label={s.label} style={linkStyle}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-onNavy)'; e.currentTarget.style.background = 'var(--c-headerSurface)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-onNavyMuted)'; e.currentTarget.style.background = 'transparent'; }}>
            {ICONS[s.key]()}
          </a>
        ))}
      </nav>
    </footer>
  );
}
