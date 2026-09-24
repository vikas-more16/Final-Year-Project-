import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Small dropdown: `trigger` renders the button (receives props to spread), `children` receives close().
 * The panel is position: fixed so scrolling containers (like the tab bar) cannot clip it.
 * Closes on outside click and Escape; follows its trigger on scroll and resize.
 */
export function Menu({ trigger, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const panelRef = useRef(null)

  // Place the panel next to the trigger, flipping above it or shifting sideways to stay on screen.
  const place = useCallback(() => {
    if (!ref.current || !panelRef.current) return
    const anchor = ref.current.getBoundingClientRect()
    const panel = panelRef.current.getBoundingClientRect()
    const margin = 8
    let left = align === 'right' ? anchor.right - panel.width : anchor.left
    left = Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin))
    let top = anchor.bottom + 4
    if (top + panel.height > window.innerHeight - margin) top = Math.max(margin, anchor.top - panel.height - 4)
    setPos({ top, left })
  }, [align])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close() }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Scrolling (including the tab bar scrolling the trigger into view) moves the panel with its trigger.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const toggle = () => {
    setPos(null)
    setOpen(!open)
  }

  return (
    <div className={`menu ${className}`} ref={ref}>
      {trigger({ 'aria-expanded': open, 'aria-haspopup': 'menu', onClick: toggle })}
      {open && (
        <div
          ref={panelRef}
          className="menu-panel"
          role="menu"
          // Measured first while invisible, then placed next to the trigger.
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
