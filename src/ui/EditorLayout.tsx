import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export function EditorLayout({ editing, children }: { editing: boolean; children: ReactNode }) {
  const shell = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(false);
  const [extent, setExtent] = useState(0);
  const [sizes, setSizes] = useState({ desktop: 544, mobile: 320 });
  const drag = useRef<{ id: number; coordinate: number; size: number } | null>(null);
  useEffect(() => {
    const element = shell.current!;
    const observer = new ResizeObserver(() => {
      const narrow = element.clientWidth <= 640;
      setMobile(narrow);
      setExtent(narrow ? element.clientHeight : element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const minimum = Math.min(mobile ? 160 : 260, extent * 0.45);
  const maximum = Math.max(minimum, extent - (mobile ? 160 : 280) - 12);
  const key = mobile ? 'mobile' : 'desktop';
  const size = Math.max(minimum, Math.min(sizes[key], maximum));
  const resize = (next: number) => setSizes(previous => ({ ...previous, [key]: Math.max(minimum, Math.min(next, maximum)) }));
  return (
    <main ref={shell} className={`app-shell app-shell--${editing ? 'editor' : 'viewer'}`} style={{ '--workspace-size': `${size}px` } as CSSProperties}>
      {children}
      {editing && <div className="workspace-divider" role="separator" tabIndex={0}
        aria-label="Resize workspace panel" aria-orientation={mobile ? 'horizontal' : 'vertical'}
        aria-valuemin={Math.round(minimum)} aria-valuemax={Math.round(maximum)} aria-valuenow={Math.round(size)}
        onPointerDown={event => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, coordinate: mobile ? event.clientY : event.clientX, size };
        }}
        onPointerMove={event => {
          if (drag.current?.id !== event.pointerId) return;
          const delta = (mobile ? event.clientY : event.clientX) - drag.current.coordinate;
          resize(drag.current.size + (mobile ? -delta : delta));
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          const decrease = mobile ? 'ArrowDown' : 'ArrowLeft';
          const increase = mobile ? 'ArrowUp' : 'ArrowRight';
          if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          resize(event.key === 'Home' ? minimum : event.key === 'End' ? maximum : size + (event.key === increase ? 24 : -24));
        }} />}
    </main>
  );
}
