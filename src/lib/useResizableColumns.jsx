import { useRef, useState, useEffect, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// useResizableColumns
//
// Attaches pointer-based drag handles to table header cells, storing column
// widths in state (and optionally in localStorage for persistence).
//
// Usage:
//   const { colWidths, getThProps, ResizeHandle } = useResizableColumns(
//     columns,          // array of { key, defaultWidth } descriptors
//     { storageKey }    // optional — persists widths across sessions
//   )
//
//   <th {...getThProps('client')}>Client Name <ResizeHandle col="client" /></th>
// ─────────────────────────────────────────────────────────────────────────────

const MIN_WIDTH = 50

export function useResizableColumns(columns, { storageKey } = {}) {
  const initWidths = () => {
    if (storageKey) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '{}')
        return Object.fromEntries(columns.map(c => [c.key, stored[c.key] || c.defaultWidth]))
      } catch {}
    }
    return Object.fromEntries(columns.map(c => [c.key, c.defaultWidth]))
  }

  const [colWidths, setColWidths] = useState(initWidths)
  const dragging = useRef(null) // { col, startX, startW }

  // Persist whenever widths change
  useEffect(() => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(colWidths)) } catch {}
    }
  }, [colWidths, storageKey])

  const onPointerDown = useCallback((e, col) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = { col, startX: e.clientX, startW: colWidths[col] || 120 }
    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [colWidths])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return
      const { col, startX, startW } = dragging.current
      const delta = e.clientX - startX
      const newW  = Math.max(MIN_WIDTH, startW + delta)
      setColWidths(prev => ({ ...prev, [col]: newW }))
    }
    const onUp = () => {
      dragging.current = null
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [])

  // th props — sets fixed width and relative positioning for the handle
  const getThProps = useCallback((col) => ({
    style: {
      width:    colWidths[col] || 'auto',
      minWidth: MIN_WIDTH,
      position: 'relative',
      overflow: 'hidden',
    },
  }), [colWidths])

  // The drag handle element — drop this as the last child of each <th>
  const ResizeHandle = useCallback(({ col }) => (
    <span
      onPointerDown={(e) => onPointerDown(e, col)}
      onClick={(e) => e.stopPropagation()}   // don't trigger sort
      style={{
        position:   'absolute',
        top:        0,
        right:      0,
        bottom:     0,
        width:      6,
        cursor:     'col-resize',
        background: 'transparent',
        zIndex:     10,
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title="Drag to resize column"
    >
      {/* Visible resize indicator on hover */}
      <span style={{
        width:        2,
        height:       '60%',
        borderRadius: 1,
        background:   'var(--border)',
        transition:   'background 0.15s',
        pointerEvents: 'none',
      }}
        className="resize-indicator"
      />
    </span>
  ), [onPointerDown])

  return { colWidths, getThProps, ResizeHandle }
}
