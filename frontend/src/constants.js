// Color tokens map to CSS variables (defined per-theme in index.css) so the
// whole app re-themes when <html data-theme> flips. Fallbacks = light values,
// so colors still render even if the stylesheet hasn't loaded.
export const C = {
  // navy shell (topbar, sidebar, footer, login brand panel)
  navy: 'var(--c-navy, #071B35)',
  navyRaised: 'var(--c-navyRaised, #0C2645)',
  navyLine: 'var(--c-navyLine, rgba(140,180,230,.12))',
  onNavy: 'var(--c-onNavy, #E8F0FA)',
  onNavyMuted: 'var(--c-onNavyMuted, #8EA3BF)',
  brandCyan: 'var(--c-brandCyan, #00C0F0)',
  brandViolet: 'var(--c-brandViolet, #8B6CF0)',
  brandGradient: 'var(--c-brandGradient, linear-gradient(135deg, #00C0F0 0%, #3E8DF3 50%, #8B6CF0 100%))',
  pageBg: 'var(--c-pageBg, #EEF3F9)',
  sidebarBg: 'var(--c-sidebarBg, #071B35)',
  sidebarBorder: 'var(--c-sidebarBorder, rgba(140,180,230,.12))',
  headerBg: 'var(--c-headerBg, #071B35)',
  headerText: 'var(--c-headerText, #E8F0FA)',
  headerMuted: 'var(--c-headerMuted, #8EA3BF)',
  headerBorder: 'var(--c-headerBorder, rgba(140,180,230,.16))',
  headerSurface: 'var(--c-headerSurface, rgba(140,180,230,.08))',
  cardBg: 'var(--c-cardBg, #ffffff)',
  border: 'var(--c-border, #DCE4EE)',
  borderDark: 'var(--c-borderDark, #C6D2E1)',
  text: 'var(--c-text, #0B1A2E)',
  textSecondary: 'var(--c-textSecondary, #48596F)',
  textMuted: 'var(--c-textMuted, #7A8CA4)',
  primary: 'var(--c-primary, #0E74D4)',
  primaryHover: 'var(--c-primaryHover, #0A5DAD)',
  primaryLight: 'var(--c-primaryLight, #E4F1FC)',
  primaryText: 'var(--c-primaryText, #0B1A2E)',
  purple: 'var(--c-purple, #6D4FE0)',
  green: 'var(--c-green, #0F8A6A)',
  amber: 'var(--c-amber, #E8A317)',
  danger: 'var(--c-danger, #D92D3A)',
  shadowSm: 'var(--c-shadowSm, 0 1px 2px rgba(7,27,53,.08))',
  shadowMd: 'var(--c-shadowMd, 0 8px 24px rgba(7,27,53,.07))',
  shadowLg: 'var(--c-shadowLg, 0 24px 64px rgba(7,27,53,.22))',
  waBg: 'var(--c-waBg, #E7EDF4)',
  // neutral surface aliases (used when migrating literal-heavy views)
  surface: 'var(--c-surface, #ffffff)',
  surfaceAlt: 'var(--c-surfaceAlt, #F5F8FC)',
  hover: 'var(--c-hover, #E9F0F8)',
  waBgPattern: 'url("data:image/svg+xml,%3Csvg width=\'16\' height=\'16\' viewBox=\'0 0 16 16\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h8v8H0z\' fill=\'%23C6D2E1\' fill-opacity=\'0.15\'/%3E%3C/svg%3E")',
};

export const CHAT = {
  incomingBg: 'var(--c-incomingBg, #ffffff)',
  incomingText: 'var(--c-incomingText, #111b21)',
  outgoingBg: 'var(--c-outgoingBg, #d9fdd3)',
  outgoingText: 'var(--c-outgoingText, #111b21)',
  chatBg: 'var(--c-chatBg, #e5ddd5)',
  bubbleRadius: '7.5px',
  bubblePadding: '6px 7px 8px 9px',
  statusDelivered: 'var(--c-statusDelivered, #53bdeb)',
  statusRead: 'var(--c-statusRead, #2F9BEF)',
  statusSent: 'var(--c-statusSent, #8696a0)',
};

export const FONT = "'Manrope Variable', 'Manrope', system-ui, sans-serif";
// Brand display face — matches the Montserrat-style wordmark in the logo.
export const BRAND_FONT = "'Montserrat', 'Manrope Variable', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

export function relativeTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Mask a phone number for display — keep the first 2 and last 3 digits, star the
// rest (e.g. "919487722330" -> "91*******330", "93xxxxx678" -> "93*****678").
// Used directly for non-interactive contexts (<option>, strings); the
// MaskedNumber component wraps this with click-to-reveal for JSX.
export function maskPhone(raw) {
  const s = String(raw ?? '');
  const digits = s.replace(/\D/g, '');
  if (digits.length <= 5) return s; // too short to meaningfully mask
  return digits.slice(0, 2) + '*'.repeat(digits.length - 5) + digits.slice(-3);
}

// Tag colors are stored as pale pastels (good as light fills, unreadable with
// the white chip text). Darken a hex color so a white label reads clearly while
// the tag keeps its own hue. Falls back to a dark slate for missing/invalid.
export function darkenColor(hex, factor = 0.5) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return '#374151';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

export function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
