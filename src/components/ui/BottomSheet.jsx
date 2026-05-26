import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function BottomSheet({ isOpen, onClose, title, children, fullScreen = false }) {
  const [rendered, setRendered] = useState(false);
  const [animClass, setAnimClass] = useState('sheet-open');
  const [backdropClass, setBackdropClass] = useState('sheet-backdrop-open');
  const closeTimer = useRef(null);

  useEffect(() => {
    if (isOpen) {
      clearTimeout(closeTimer.current);
      setRendered(true);
      setAnimClass('sheet-open');
      setBackdropClass('sheet-backdrop-open');
      document.body.style.overflow = 'hidden';
    } else {
      setAnimClass('sheet-close');
      setBackdropClass('sheet-backdrop-close');
      document.body.style.overflow = '';
      closeTimer.current = setTimeout(() => setRendered(false), 260);
    }
    return () => {
      clearTimeout(closeTimer.current);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/65 backdrop-blur-sm ${backdropClass}`}
        onClick={onClose}
      />

      {/* Sheet panel */}
      <div
        className={`relative z-10 bg-slate-900 rounded-t-2xl flex flex-col ${
          fullScreen ? 'h-[95vh]' : 'max-h-[92vh]'
        } ${animClass}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 shrink-0">
            <h2 className="text-base font-semibold text-slate-50">{title}</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 scroll-area overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
