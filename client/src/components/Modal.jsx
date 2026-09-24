import { useEffect, useRef } from 'react'

/** Accessible dialog built on the native <dialog> element (focus trap and Esc handling for free). */
export function Modal({ title, onClose, children, width = 520 }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    // showModal() focuses the first focusable element (the close button); start on the first field instead.
    dialog.querySelector('.modal-body :is(input, select, textarea):not(:disabled)')?.focus()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="modal"
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}

export function ConfirmModal({ title, message, confirmLabel, danger, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width={440}>
      <p className="modal-text">{message}</p>
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
