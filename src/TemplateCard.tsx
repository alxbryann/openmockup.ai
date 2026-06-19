import type { SceneTemplate } from './sceneTemplates'
import { templatePreviewStyle, useTemplateThumbnail } from './templateThumbnails'

type Props = {
  template: SceneTemplate
  height?: number
  onClick?: () => void
  onDelete?: () => void
  showName?: boolean
}

export function TemplateCard({ template, height = 44, onClick, onDelete, showName = true }: Props) {
  const thumb = useTemplateThumbnail(template)
  const isUser = template.id.startsWith('user-')

  const inner = (
    <>
      <span
        aria-hidden
        style={{ display: 'block', height, ...templatePreviewStyle(thumb) }}
      />
      {showName && (
        <span
          className="px-2 py-1.5"
          style={{ font: '600 11px/1.2 var(--font-sans)', color: 'rgba(255,255,255,.85)' }}
        >
          {template.name}
          {isUser ? ' ★' : ''}
        </span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={template.description}
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border-0 p-0 text-left transition"
        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)' }}
      >
        {inner}
        {onDelete && isUser && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDelete() } }}
            title="Eliminar template"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 20,
              height: 20,
              borderRadius: 6,
              background: 'rgba(0,0,0,.55)',
              color: '#fff',
              fontSize: 12,
              lineHeight: '20px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            ×
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {inner}
    </div>
  )
}
