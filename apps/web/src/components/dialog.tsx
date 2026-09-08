import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Icon } from "./icon";

export function Dialog({ title, onClose, children, initialFocus }: { title: string; onClose: () => void; children: ReactNode; initialFocus?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    initialFocus?.current?.focus();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [initialFocus]);
  return <dialog className="native-dialog" ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-head"><h3>{title}</h3><button type="button" className="btn btn-ghost btn-sm" aria-label="Close dialog" title="Close dialog" onClick={onClose}><Icon name="x" /></button></div>
    {children}
  </dialog>;
}
