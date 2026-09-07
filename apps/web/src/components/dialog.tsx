import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="native-dialog" ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-head"><h3>{title}</h3><button type="button" className="btn btn-ghost btn-sm" aria-label="Close dialog" title="Close dialog" onClick={onClose}><Icon name="x" /></button></div>
    {children}
  </dialog>;
}
