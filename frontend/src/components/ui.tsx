import type { ReactNode } from 'react'
import { AlertTriangle, Check, Minus, X } from 'lucide-react'
import type { DisclosureStatus } from '@/types'
import { STATUS_META } from '@/lib/compliance'

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag
      className={`rounded-xl border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary:
      'bg-brand text-white hover:brightness-110 disabled:opacity-50 border border-transparent',
    secondary:
      'bg-surface-1 text-ink border border-hairline-strong hover:bg-surface-2 disabled:opacity-50',
    ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink border border-transparent',
    danger: 'bg-transparent text-critical border border-hairline-strong hover:bg-surface-2',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' }
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background-color,filter,opacity] disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}

export function StatusPill({ status }: { status: DisclosureStatus }) {
  const meta = STATUS_META[status]
  const Icon =
    meta.icon === 'check' ? Check : meta.icon === 'alert' ? AlertTriangle : meta.icon === 'x' ? X : Minus
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: meta.color, borderColor: meta.color }}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {meta.label}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'warning'
}) {
  const tones = {
    neutral: 'border-hairline-strong text-ink-2',
    brand: 'border-transparent bg-brand-wash text-brand-ink',
    warning: 'border-[var(--warning)] text-[var(--warning)]',
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  unit,
  children,
}: {
  label: string
  hint?: string
  unit?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {unit && <span className="text-[11px] text-ink-muted">{unit}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs leading-snug text-ink-muted">{hint}</p>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-hairline-strong bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-muted transition-colors focus:border-brand focus:outline-none'

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="text-ink-muted">{icon}</div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-ink-2">{body}</p>
      {action}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning'
  title?: string
  children: ReactNode
}) {
  const color = tone === 'warning' ? 'var(--warning)' : 'var(--series-s)'
  return (
    <div
      className="rounded-lg border-l-2 bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-2"
      style={{ borderLeftColor: color }}
    >
      {title && <p className="mb-1 font-semibold text-ink">{title}</p>}
      {children}
    </div>
  )
}
