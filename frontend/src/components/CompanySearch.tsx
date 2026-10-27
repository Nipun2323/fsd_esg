import { useEffect, useRef, useState } from 'react'
import { Building2, Search, X } from 'lucide-react'
import { api } from '@/api/client'
import type { Company } from '@/types'
import { Spinner } from './ui'

/**
 * Type-ahead over the imported companies.
 *
 * There are hundreds of them, so a dropdown is not an option — and
 * nothing is queried until something is typed, which is what keeps the
 * database idle for companies nobody has asked for.
 */
export function CompanySearch({
  onSelect,
  autoFocus = false,
  placeholder = 'Search company or ticker…',
}: {
  onSelect: (company: Company) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Company[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      setError(null)
      return
    }
    // Debounced so a search fires per pause, not per keystroke.
    const t = setTimeout(() => {
      setBusy(true)
      api
        .searchCompanies(term)
        .then((r) => {
          setResults(r)
          setActive(0)
          setOpen(true)
          setError(null)
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setBusy(false))
    }, 220)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const choose = (c: Company) => {
    onSelect(c)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-1 px-3 py-2 transition-colors focus-within:border-brand">
        <Search size={15} className="shrink-0 text-ink-muted" aria-hidden />
        <input
          id="company-search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search for a company"
          aria-autocomplete="list"
          aria-expanded={open}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
        />
        {busy && <Spinner size={14} />}
        {!busy && query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="shrink-0 rounded p-0.5 text-ink-muted hover:text-ink"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--critical)' }}>
          {error}
        </p>
      )}

      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-hairline bg-surface-1 py-1 shadow-lg"
        >
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  i === active ? 'bg-surface-2' : ''
                }`}
              >
                <Building2 size={14} className="shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{c.name}</span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    {[c.ticker, c.industry].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                {c.total_grade && (
                  <span className="shrink-0 rounded border border-hairline px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                    {c.total_grade}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !busy && query.trim() && results.length === 0 && !error && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-hairline bg-surface-1 px-3 py-3 text-sm text-ink-2 shadow-lg">
          No company matching “{query.trim()}”.
        </div>
      )}
    </div>
  )
}
