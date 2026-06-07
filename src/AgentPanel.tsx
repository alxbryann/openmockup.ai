import { useState, useRef, useEffect } from 'react'
import { useStore } from './store'
import { GRADIENT_PRESETS } from './gradients'

const API_KEY_STORAGE = 'openmockup.deepseekKey.v1'
const ENV_API_KEY = import.meta.env.VITE_DEEPSEEK_KEY as string | undefined

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface UIMessage {
  id: string
  type: 'user' | 'assistant' | 'tool_use' | 'tool_ok' | 'tool_err' | 'error'
  text?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  streaming?: boolean
}

interface StreamChunk {
  choices: Array<{
    delta: {
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const STUDIO_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'add_device',
      description: 'Add a phone (iPhone) or mac (MacBook) to the 3D scene.',
      parameters: {
        type: 'object' as const,
        properties: {
          kind: { type: 'string', enum: ['phone', 'mac'], description: 'phone = iPhone 17, mac = MacBook' },
        },
        required: ['kind'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_device',
      description: 'Remove a device by 0-based index. Cannot remove the last remaining device.',
      parameters: {
        type: 'object' as const,
        properties: {
          index: { type: 'integer', minimum: 0, description: '0-based device index' },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_background',
      description: 'Set the scene background. Can be a solid hex color or a CSS gradient string.',
      parameters: {
        type: 'object' as const,
        properties: {
          value: {
            type: 'string',
            description: 'Hex color e.g. "#0a0a0a" or CSS gradient e.g. "linear-gradient(135deg, #8B5CF6, #EC4899)"',
          },
        },
        required: ['value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_device_color',
      description: 'Set the frame/body color of a device.',
      parameters: {
        type: 'object' as const,
        properties: {
          index: { type: 'integer', minimum: 0 },
          hex: { type: 'string', description: 'Hex color code, e.g. "#DFCEEA"' },
        },
        required: ['index', 'hex'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_device_type',
      description: 'Change a device between phone (iPhone) and mac (MacBook).',
      parameters: {
        type: 'object' as const,
        properties: {
          index: { type: 'integer', minimum: 0 },
          kind: { type: 'string', enum: ['phone', 'mac'] },
        },
        required: ['index', 'kind'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_device_rotation',
      description: 'Set the 3D rotation of a device in degrees. x=tilt fwd/back, y=spin left/right, z=lean sideways.',
      parameters: {
        type: 'object' as const,
        properties: {
          index: { type: 'integer', minimum: 0 },
          x: { type: 'number', description: 'degrees, -180 to 180' },
          y: { type: 'number', description: 'degrees, -180 to 180' },
          z: { type: 'number', description: 'degrees, -180 to 180' },
        },
        required: ['index', 'x', 'y', 'z'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_device_position_x',
      description: 'Set horizontal position of a device. Range: -40 (far left) to 40 (far right), 0 = center.',
      parameters: {
        type: 'object' as const,
        properties: {
          index: { type: 'integer', minimum: 0 },
          x: { type: 'number' },
        },
        required: ['index', 'x'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_auto_rotate',
      description: 'Enable or disable continuous Y-axis auto-rotation on all devices.',
      parameters: {
        type: 'object' as const,
        properties: {
          enabled: { type: 'boolean' },
        },
        required: ['enabled'],
      },
    },
  },
]

// ── SSE streaming ─────────────────────────────────────────────────────────────

async function* streamMessages(
  apiKey: string,
  messages: ApiMessage[],
  system: string,
): AsyncGenerator<StreamChunk> {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 1024,
      messages: [{ role: 'system', content: system }, ...messages],
      tools: STUDIO_TOOLS,
      stream: true,
    }),
  })

  if (!resp.ok) {
    let msg = `API error ${resp.status}`
    try {
      const err = (await resp.json()) as { error?: { message?: string } }
      if (err.error?.message) msg = err.error.message
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') return
        try { yield JSON.parse(raw) as StreamChunk } catch { /* malformed chunk */ }
      }
    }
  }
}

// ── Tool execution ────────────────────────────────────────────────────────────

function executeTool(name: string, input: Record<string, unknown>): string {
  const store = useStore.getState()
  const devices = store.devices

  try {
    switch (name) {
      case 'add_device': {
        const kind = input.kind === 'mac' ? 'mac' as const : 'phone' as const
        store.addDevice(kind)
        return `Added ${kind}. Scene now has ${devices.length + 1} device(s).`
      }
      case 'remove_device': {
        const idx = Number(input.index)
        if (idx < 0 || idx >= devices.length) return `Error: index ${idx} out of range (0–${devices.length - 1})`
        if (devices.length <= 1) return 'Error: cannot remove the last device'
        store.removeDevice(devices[idx].id)
        return `Removed device ${idx}`
      }
      case 'set_background': {
        const val = String(input.value)
        store.setBgColor(val)
        return `Background set`
      }
      case 'set_device_color': {
        const idx = Number(input.index)
        if (idx < 0 || idx >= devices.length) return `Error: index ${idx} out of range`
        store.updateDevice(devices[idx].id, { deviceColor: String(input.hex) })
        return `Device ${idx} color → ${input.hex}`
      }
      case 'set_device_type': {
        const idx = Number(input.index)
        if (idx < 0 || idx >= devices.length) return `Error: index ${idx} out of range`
        const kind = input.kind === 'mac' ? 'mac' as const : 'phone' as const
        store.updateDevice(devices[idx].id, { deviceKind: kind })
        store.resetDeviceRotation(devices[idx].id)
        return `Device ${idx} → ${kind}`
      }
      case 'set_device_rotation': {
        const idx = Number(input.index)
        if (idx < 0 || idx >= devices.length) return `Error: index ${idx} out of range`
        const toRad = (v: unknown) => (Number(v) * Math.PI) / 180
        store.setDeviceRotation(devices[idx].id, [toRad(input.x), toRad(input.y), toRad(input.z)])
        return `Device ${idx} rotation → x:${input.x}° y:${input.y}° z:${input.z}°`
      }
      case 'set_device_position_x': {
        const idx = Number(input.index)
        if (idx < 0 || idx >= devices.length) return `Error: index ${idx} out of range`
        store.updateDevice(devices[idx].id, { positionX: Number(input.x) })
        return `Device ${idx} X → ${input.x}`
      }
      case 'set_auto_rotate': {
        store.setAutoRotate(Boolean(input.enabled))
        return `Auto-rotate ${input.enabled ? 'on' : 'off'}`
      }
      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const { devices, bgColor, autoRotate } = useStore.getState()

  const deviceList =
    devices.length === 0
      ? '  (empty)'
      : devices
          .map((d, i) => {
            const rot = d.deviceRotation.map((r) => `${Math.round((r * 180) / Math.PI)}°`)
            return `  [${i}] ${d.deviceKind} | color: ${d.deviceColor} | rotation x:${rot[0]} y:${rot[1]} z:${rot[2]} | posX: ${d.positionX}`
          })
          .join('\n')

  const gradientList = GRADIENT_PRESETS.map((g) => `  ${g.label}: ${g.css}`).join('\n')

  return `You are a creative AI director for OpenMockup Studio — a 3D device mockup tool. You compose beautiful iPhone and MacBook presentations by calling tools that control the live 3D scene.

CURRENT SCENE:
${deviceList}
Background: ${bgColor}
Auto-rotate: ${autoRotate}

DEVICE COLORS:
iPhone 17: Lavanda #DFCEEA | Mist Blue #96AED1 | Sage #A9B689 | Black #353839 | White #F5F5F5
iPhone 17 Air: Sky Blue #F0F9FF | Light Gold #FFFCF5 | Space Black #000000 | Cloud White #FCFCFC
iPhone 17 Pro: Deep Blue #32374A | Cosmic Orange #F77E2D | Silver #F5F5F5

BACKGROUND PRESETS (use exact CSS string as the value):
${gradientList}
Or any hex color: #0a0a0a, #ffffff, #0f172a, etc.

COMPOSITION TIPS:
- Multiple devices: stagger X positions (e.g. -10, 0, 10) for depth.
- Slight Y rotation (15–30°) = dynamic. Heavy Y (45–60°) = dramatic hero shot.
- Dark bg (#0a0a0a, #0f172a) + light devices = premium.
- Light bg (#f4f4f5, #ffffff) + dark devices = clean editorial.
- Tilt one device (z: 10–20°) for asymmetric energy.
- Use auto-rotate for cinematic loops.

Be concise — describe what you did in 1–2 sentences after acting. Call multiple tools in one response to compose the full scene at once.`
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Dark hero shot with 3 iPhones',
  'Cosmic gradient with a tilted phone',
  'MacBook + phone editorial layout',
  'Minimal white with 2 phones side by side',
]

// ── Main component ────────────────────────────────────────────────────────────

export function AgentPanel() {
  // Key: env var baked at build time takes priority, localStorage as fallback
  const [apiKey] = useState(() => ENV_API_KEY ?? localStorage.getItem(API_KEY_STORAGE) ?? '')

  const [uiMessages, setUiMessages] = useState<UIMessage[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMessages])

  function clearConversation() {
    setUiMessages([])
    setApiMessages([])
  }

  async function send(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return
    setInput('')
    setLoading(true)

    const userUi: UIMessage = { id: crypto.randomUUID(), type: 'user', text: userText }
    setUiMessages((prev) => [...prev, userUi])

    const nextApiMessages: ApiMessage[] = [...apiMessages, { role: 'user', content: userText }]
    setApiMessages(nextApiMessages)

    try {
      await runConversation(nextApiMessages)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUiMessages((prev) => [...prev, { id: crypto.randomUUID(), type: 'error', text: msg }])
    } finally {
      setLoading(false)
    }
  }

  async function runConversation(msgs: ApiMessage[]) {
    let messages = [...msgs]

    for (;;) {
      const assistantId = crypto.randomUUID()
      setUiMessages((prev) => [
        ...prev,
        { id: assistantId, type: 'assistant', text: '', streaming: true },
      ])

      let fullText = ''
      const pendingTools: ToolCall[] = []
      const partialArgs: Record<number, { id: string; name: string; arguments: string }> = {}

      for await (const chunk of streamMessages(apiKey, messages, buildSystemPrompt())) {
        const delta = chunk.choices[0]?.delta
        if (!delta) continue

        if (delta.content) {
          fullText += delta.content
          setUiMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: fullText } : m)),
          )
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const slot = partialArgs[tc.index] ?? { id: '', name: '', arguments: '' }
            if (tc.id) slot.id = tc.id
            if (tc.function?.name) slot.name = tc.function.name
            if (tc.function?.arguments) slot.arguments += tc.function.arguments
            partialArgs[tc.index] = slot
          }
        }
      }

      for (const slot of Object.values(partialArgs)) {
        if (slot.id && slot.name) {
          pendingTools.push({
            id: slot.id,
            type: 'function',
            function: { name: slot.name, arguments: slot.arguments || '{}' },
          })
        }
      }

      setUiMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      )

      const assistantMessage: ApiMessage = {
        role: 'assistant',
        content: fullText || null,
        ...(pendingTools.length > 0 ? { tool_calls: pendingTools } : {}),
      }
      messages = [...messages, assistantMessage]

      if (pendingTools.length === 0) {
        setApiMessages(messages)
        break
      }

      for (const tool of pendingTools) {
        let toolInput: Record<string, unknown> = {}
        try {
          toolInput = JSON.parse(tool.function.arguments) as Record<string, unknown>
        } catch { /* malformed JSON */ }

        setUiMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: 'tool_use',
            toolName: tool.function.name,
            toolInput,
          },
        ])

        const result = executeTool(tool.function.name, toolInput)

        setUiMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: result.startsWith('Error') ? 'tool_err' : 'tool_ok',
            text: result,
          },
        ])

        messages = [
          ...messages,
          { role: 'tool', tool_call_id: tool.id, content: result },
        ]
      }

      setApiMessages(messages)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // Auto-grow textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  // ── No key configured (should never happen in production) ────────────────

  if (!apiKey) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1.5rem' }}>
        <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'rgba(255,255,255,.35)', textAlign: 'center' }}>
          API key not configured.
        </p>
      </div>
    )
  }

  // ── Chat view ──────────────────────────────────────────────────────────────

  const isEmpty = uiMessages.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem 0.625rem',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <OrbIcon size={18} />
          <span
            style={{
              font: '600 12px/1 var(--font-sans)',
              color: 'rgba(255,255,255,.85)',
              letterSpacing: '0.01em',
            }}
          >
            DeepSeek
          </span>
          <span
            style={{
              font: '400 10px/1 var(--font-sans)',
              color: 'rgba(255,255,255,.3)',
              background: 'rgba(255,255,255,.07)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 4,
              padding: '2px 5px',
            }}
          >
            chat
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {uiMessages.length > 0 && (
            <button
              onClick={clearConversation}
              title="Clear conversation"
              style={{
                background: 'none',
                border: 'none',
                padding: '0.25rem 0.5rem',
                font: '400 10px/1 var(--font-sans)',
                color: 'rgba(255,255,255,.3)',
                cursor: 'pointer',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,.6)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,.3)' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.75rem 0.875rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
          minHeight: 0,
        }}
      >
        {isEmpty && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '1rem',
              paddingBottom: '1rem',
            }}
          >
            <OrbIcon size={36} style={{ opacity: 0.55 }} />
            <p
              style={{
                font: '400 12px/1.55 var(--font-sans)',
                color: 'rgba(255,255,255,.4)',
                textAlign: 'center',
                maxWidth: 220,
                margin: 0,
              }}
            >
              Describe any mockup and DeepSeek will compose it live.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: 260 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    background: 'rgba(255,255,255,.05)',
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: '0.625rem',
                    padding: '0.5rem 0.75rem',
                    font: '400 11px/1.4 var(--font-sans)',
                    color: 'rgba(255,255,255,.55)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background = 'rgba(110,75,255,.15)'
                    el.style.borderColor = 'rgba(110,75,255,.4)'
                    el.style.color = 'rgba(255,255,255,.8)'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background = 'rgba(255,255,255,.05)'
                    el.style.borderColor = 'rgba(255,255,255,.1)'
                    el.style.color = 'rgba(255,255,255,.55)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {uiMessages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} />
        ))}

        {loading && !uiMessages.find((m) => m.type === 'assistant' && m.streaming) && (
          <ThinkingBubble />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          flexShrink: 0,
          padding: '0.5rem 0.75rem 0.75rem',
          borderTop: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '0.5rem',
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.11)',
            borderRadius: '0.875rem',
            padding: '0.5rem 0.5rem 0.5rem 0.75rem',
            transition: 'border-color 0.15s',
          }}
          onFocusCapture={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(110,75,255,.45)'
          }}
          onBlurCapture={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,.11)'
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe the mockup…"
            rows={1}
            disabled={loading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'rgba(255,255,255,.9)',
              font: '400 13px/1.5 var(--font-sans)',
              maxHeight: 120,
              overflowY: 'auto',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: '0.5rem',
              border: 'none',
              background: input.trim() && !loading ? 'var(--accent)' : 'rgba(255,255,255,.09)',
              color: '#fff',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              transition: 'background 0.15s',
              boxShadow: input.trim() && !loading ? '0 4px 14px rgba(110,75,255,.4)' : 'none',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
        <p
          style={{
            marginTop: '0.375rem',
            font: '400 10px/1 var(--font-sans)',
            color: 'rgba(255,255,255,.2)',
            textAlign: 'center',
          }}
        >
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: UIMessage }) {
  if (msg.type === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            background: 'rgba(110,75,255,.28)',
            border: '1px solid rgba(110,75,255,.4)',
            borderRadius: '1rem 1rem 0.25rem 1rem',
            padding: '0.5rem 0.75rem',
            maxWidth: '88%',
            font: '400 12.5px/1.55 var(--font-sans)',
            color: 'rgba(255,255,255,.9)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.type === 'assistant') {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <OrbIcon size={18} />
        </div>
        <div
          style={{
            font: '400 12.5px/1.6 var(--font-sans)',
            color: 'rgba(255,255,255,.82)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            flex: 1,
          }}
        >
          {msg.text || (msg.streaming ? <TypingDots /> : null)}
        </div>
      </div>
    )
  }

  if (msg.type === 'tool_use') {
    const label = (msg.toolName ?? 'tool').replace(/_/g, ' ')
    const args = msg.toolInput
      ? Object.entries(msg.toolInput)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' ')
      : ''
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.375rem',
          padding: '0.375rem 0.625rem',
          background: 'rgba(110,75,255,.1)',
          border: '1px solid rgba(110,75,255,.2)',
          borderRadius: '0.5rem',
          marginLeft: '1.625rem',
        }}
      >
        <span style={{ color: 'rgba(160,140,255,.7)', fontSize: 10, marginTop: 1, flexShrink: 0 }}>⚡</span>
        <span
          style={{ font: '500 11px/1.4 var(--font-mono)', color: 'rgba(160,140,255,.9)' }}
        >
          {label}
          {args && (
            <span style={{ fontWeight: 400, color: 'rgba(160,140,255,.55)', marginLeft: '0.375rem' }}>
              {args}
            </span>
          )}
        </span>
      </div>
    )
  }

  if (msg.type === 'tool_ok') {
    return (
      <div
        style={{
          font: '400 10.5px/1.4 var(--font-mono)',
          color: 'rgba(80,210,120,.75)',
          marginLeft: '1.625rem',
          paddingLeft: '0.375rem',
        }}
      >
        ✓ {msg.text}
      </div>
    )
  }

  if (msg.type === 'tool_err') {
    return (
      <div
        style={{
          font: '400 10.5px/1.4 var(--font-mono)',
          color: 'rgba(255,100,90,.85)',
          marginLeft: '1.625rem',
          paddingLeft: '0.375rem',
        }}
      >
        ✕ {msg.text}
      </div>
    )
  }

  if (msg.type === 'error') {
    return (
      <div
        style={{
          padding: '0.5rem 0.75rem',
          background: 'rgba(255,60,50,.1)',
          border: '1px solid rgba(255,60,50,.25)',
          borderRadius: '0.5rem',
          font: '400 12px/1.45 var(--font-sans)',
          color: 'rgba(255,150,130,.9)',
        }}
      >
        {msg.text}
      </div>
    )
  }

  return null
}

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <OrbIcon size={18} />
      <TypingDots />
    </div>
  )
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', padding: '0 2px' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="agent-dot"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  )
}

function OrbIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  const id = `orb-${size}`
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} style={{ flexShrink: 0, ...style }} aria-hidden>
      <defs>
        <radialGradient id={`${id}-main`} cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".4" stopColor="#c5b3ff" />
          <stop offset="1" stopColor="#6e4bff" />
        </radialGradient>
        <radialGradient id={`${id}-blush`} cx="65%" cy="65%" r="60%">
          <stop offset="0" stopColor="#ff7eb6" stopOpacity=".65" />
          <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill={`url(#${id}-main)`} />
      <circle cx="20" cy="20" r="17" fill={`url(#${id}-blush)`} />
      <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".5" />
    </svg>
  )
}
