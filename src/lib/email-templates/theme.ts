/**
 * Shared ParkVault email styling. Body background stays #ffffff for
 * deliverability; brand colors are used for the wordmark, headings and CTA.
 */

export const colors = {
  ink: '#22201b',
  muted: '#5c5a53',
  faint: '#8d8a82',
  teal: '#14544a',
  amber: '#c8601f',
  cream: '#fdf8f1',
  border: '#e3d9cb',
}

export const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}

export const container = {
  maxWidth: '520px',
  margin: '0 auto',
  padding: '28px 24px 36px',
}

export const wordmark = {
  fontSize: '15px',
  fontWeight: 'bold' as const,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: colors.teal,
  textDecoration: 'none',
  margin: '0 0 4px',
}

export const rule = {
  borderColor: colors.border,
  borderWidth: '1px 0 0',
  margin: '14px 0 24px',
}

export const h1 = {
  fontSize: '21px',
  fontWeight: 'bold' as const,
  color: colors.ink,
  lineHeight: '1.3',
  margin: '0 0 16px',
}

export const text = {
  fontSize: '14.5px',
  color: colors.muted,
  lineHeight: '1.6',
  margin: '0 0 20px',
}

export const link = { color: colors.teal, textDecoration: 'underline' }

export const button = {
  display: 'inline-block',
  backgroundColor: colors.teal,
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  border: `1px solid ${colors.teal}`,
  borderRadius: '6px',
  padding: '13px 26px',
  textDecoration: 'none',
}

export const codeStyle = {
  fontFamily: "'SF Mono', Menlo, Courier, monospace",
  fontSize: '26px',
  fontWeight: 'bold' as const,
  letterSpacing: '0.16em',
  color: colors.teal,
  backgroundColor: colors.cream,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  padding: '14px 18px',
  margin: '0 0 26px',
}

export const footer = {
  fontSize: '12px',
  color: colors.faint,
  lineHeight: '1.6',
  margin: '28px 0 0',
}

// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
export const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #f7eee4 !important; color: #14544a !important; border-color: #f7eee4 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #f7eee4 !important; color: #14544a !important; border-color: #f7eee4 !important; }
  [data-ogsb] .dm-btn { background-color: #f7eee4 !important; color: #14544a !important; border-color: #f7eee4 !important; }
`
