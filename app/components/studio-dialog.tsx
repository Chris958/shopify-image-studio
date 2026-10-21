'use client';

import {useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** One viewport-bound dialog, independent of page grids and scrolling. */
export function StudioDialog({children, wide, onClose}: {
  children: ReactNode;
  wide?: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previousFocus = returnFocus.current;
    const shell = document.querySelector<HTMLElement>('.app-shell');
    const previousInert = shell?.inert;
    const {overflow} = document.body.style;
    document.body.style.overflow = 'hidden';
    if (shell) shell.inert = true;
    const controls = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(focusable) || [])
      .filter(element => element.getClientRects().length > 0);
    const first = panel.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select');
    (first || panel.current)?.focus({preventScroll: true});
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0], last = elements[elements.length - 1];
      const outside = !panel.current?.contains(document.activeElement);
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current || outside)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = overflow;
      if (shell) shell.inert = previousInert ?? false;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div className="studio-dialog-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={panel} className={'studio-dialog' + (wide ? ' wide' : '')}
        role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
        <button type="button" className="studio-dialog-close icon-button" aria-label="关闭" onClick={onClose}>
          <X size={20}/>
        </button>
        {children}
      </div>
    </div>, document.body,
  );
}
