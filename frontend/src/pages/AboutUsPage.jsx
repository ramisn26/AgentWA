import { Globe, Instagram, Facebook, Mail, Phone, ExternalLink, MessageCircle } from 'lucide-react';
import { C, FONT, BRAND_FONT } from '../constants.js';
import { BRAND } from '../brand.js';

// PaviRami AI Zen contact points (from pavirami.in). Each opens in a new tab.
const LINKS = [
  { label: 'Website',   sub: 'pavirami.in',              url: BRAND.website, Icon: Globe,         color: '#0E74D4' },
  { label: 'WhatsApp',  sub: '+91 90952 90768',          url: 'https://wa.me/919095290768', Icon: MessageCircle, color: '#1DA851' },
  { label: 'Instagram', sub: '@paviramiai',              url: 'https://www.instagram.com/paviramiai/', Icon: Instagram, color: '#E1306C' },
  { label: 'Facebook',  sub: 'PaviRami AI Zen',          url: 'https://www.facebook.com/profile.php?id=61587744927292', Icon: Facebook, color: '#1877F2' },
  { label: 'Email',     sub: 'contact@pavirami.in',      url: 'mailto:contact@pavirami.in', Icon: Mail,          color: '#6D4FE0' },
  { label: 'Call',      sub: '+91 90952 90768',          url: 'tel:+919095290768', Icon: Phone,         color: '#0F8A6A' },
];

export default function AboutUsPage() {
  return (
    <div style={{ padding: '40px 24px', fontFamily: FONT, color: C.text, maxWidth: 780, margin: '0 auto', width: '100%' }}>
      <div style={{
        background: C.navy, borderRadius: 18, padding: '32px 28px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
      }}>
        <img src={BRAND.logo} alt={BRAND.name} style={{ width: 190, height: 'auto' }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontFamily: BRAND_FONT, fontSize: 26, fontWeight: 700, margin: 0, color: C.onNavy, letterSpacing: '-0.01em' }}>
            About {BRAND.name}
          </h1>
          <p style={{ fontSize: 14, color: C.onNavyMuted, margin: '10px 0 0', lineHeight: 1.65 }}>
            An AI automation agency from Tamil Nadu, India — AI agents, WhatsApp automation,
            voice AI and n8n workflows that take repetitive work off your team. {BRAND.tagline}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {LINKS.map(({ label, sub, url, Icon, color }) => (
          <a
            key={label}
            href={url}
            target={url.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
              background: C.cardBg, border: `1px solid ${C.border}`, textDecoration: 'none', color: C.text,
              boxShadow: C.shadowSm, transition: 'box-shadow .15s, border-color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = C.shadowMd; e.currentTarget.style.borderColor = color; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = C.shadowSm; e.currentTarget.style.borderColor = 'var(--c-border)'; }}
          >
            <span style={{
              width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: `${color}14`, color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={20} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{label}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
            </span>
            <ExternalLink size={15} style={{ color: C.textMuted, flexShrink: 0 }} />
          </a>
        ))}
      </div>

      {/* Open-source attribution — required by the upstream licence (do not remove). */}
      <p style={{ marginTop: 32, fontSize: 12, color: C.textMuted, lineHeight: 1.6, textAlign: 'center' }}>
        Built on ForgeChat, open-source software by Forgemind Techhub LLP, used under the
        Sustainable Use License. Modified by {BRAND.name}.
      </p>
    </div>
  );
}
