import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, Sparkles, Square, X } from 'lucide-react'
import { api, USING_MOCK } from '@/api/client'
import { useApp } from '@/lib/store'
import type { ChatMessage } from '@/types'
import { metricLabel } from '@/lib/calculator'
import { Spinner } from './ui'

const SUGGESTIONS = [
  "What's our carbon footprint?",
  'What data are we missing?',
  'How ready are we for BRSR?',
  'Explain the CSRD requirements',
]

/** Minimal inline renderer: **bold** and bullet lines. Nothing is parsed as HTML. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        if (line.trim() === '') return <div key={i} className="h-2" />
        const bullet = line.trimStart().startsWith('•')
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
          <p key={i} className={bullet ? 'pl-3 -indent-3' : undefined}>
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**') ? (
                <strong key={j} className="font-semibold text-ink">
                  {p.slice(2, -2)}
                </strong>
              ) : (
                <span key={j}>{p}</span>
              ),
            )}
          </p>
        )
      })}
    </>
  )
}

export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { company, year } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || !company || busy) return
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        createdAt: new Date().toISOString(),
      }
      const next = [...messages, userMsg]
      setMessages(next)
      setInput('')
      setBusy(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const reply = await api.chat(company.id, year, next, controller.signal)
        setMessages((m) => [...m, reply])
      } catch (e) {
        const msg = (e as Error).message
        if (!controller.signal.aborted) {
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `That request failed: ${msg}`,
              createdAt: new Date().toISOString(),
            },
          ])
        }
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [company, year, messages, busy],
  )

  const stop = () => {
    abortRef.current?.abort()
    setBusy(false)
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        aria-label="ESG assistant"
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={`fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[400px] flex-col border-l border-hairline bg-surface-1 transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg"
            style={{ background: 'var(--brand-wash)', color: 'var(--brand-ink)' }}
          >
            <Bot size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">ESG assistant</h2>
            <p className="truncate text-[11px] text-ink-muted">
              {company ? `${company.name} · FY ${year}` : 'No company selected'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close assistant"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="animate-rise">
              <div className="mb-4 rounded-lg bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
                <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink">
                  <Sparkles size={13} aria-hidden />
                  Grounded in your own data
                </p>
                <p>
                  Answers are built from the figures saved for this company and year. If a number
                  has not been entered, it says so rather than estimating one.
                </p>
                {USING_MOCK && (
                  <p className="mt-2 text-ink-muted">
                    Demo mode: replies are templated from your data, not written by a language
                    model. Point <code className="font-mono text-[11px]">VITE_API_BASE_URL</code> at
                    the backend to use the real model.
                  </p>
                )}
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Try asking
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-lg border border-hairline px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:border-brand hover:bg-surface-2 hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`animate-rise ${m.role === 'user' ? 'self-end' : 'self-start'} max-w-[92%]`}
                >
                  <div
                    className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-brand text-white'
                        : 'border border-hairline bg-surface-2 text-ink-2'
                    }`}
                  >
                    {m.role === 'user' ? m.content : <RichText text={m.content} />}
                  </div>
                  {m.citations && m.citations.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {m.citations.map((c) => (
                        <span
                          key={c}
                          className="rounded border border-hairline px-1.5 py-0.5 text-[10px] text-ink-muted"
                        >
                          {metricLabel(c)}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 self-start rounded-xl border border-hairline bg-surface-2 px-3.5 py-2.5 text-sm text-ink-muted">
                  <Spinner size={14} />
                  Thinking
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className="border-t border-hairline p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <div className="flex items-end gap-2 rounded-xl border border-hairline-strong bg-surface-1 px-3 py-2 transition-colors focus-within:border-brand">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              placeholder="Ask about your ESG data…"
              aria-label="Message the ESG assistant"
              className="max-h-[120px] flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-hairline-strong text-ink-2 transition-colors hover:bg-surface-2"
              >
                <Square size={12} fill="currentColor" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-white transition-opacity disabled:opacity-30"
              >
                <ArrowUp size={14} aria-hidden />
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  )
}
