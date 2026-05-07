import { useEffect } from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';

/**
 * iOS-style confirmation dialog overlay.
 *
 * Props:
 *   isOpen        — boolean
 *   icon          — 'danger' | 'clockout'  (default 'danger')
 *   title         — string
 *   message       — string (optional)
 *   confirmLabel  — string (default 'Confirm')
 *   cancelLabel   — string (default 'Cancel')
 *   onConfirm     — fn
 *   onCancel      — fn
 *   loading       — boolean (disables confirm button)
 */
export default function ConfirmModal({
  isOpen,
  icon = 'danger',
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const isDanger = icon === 'danger';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-5">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog card */}
      <div className="relative z-10 w-full max-w-[320px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 confirm-pop">

        {/* Icon + text */}
        <div className="flex flex-col items-center pt-8 pb-6 px-6 text-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
            isDanger ? 'bg-red-500/12' : 'bg-amber-400/12'
          }`}>
            {isDanger
              ? <AlertTriangle size={26} className="text-red-400" />
              : <LogOut      size={26} className="text-amber-400" />
            }
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-50">{title}</h2>
            {message && (
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{message}</p>
            )}
          </div>
        </div>

        {/* Buttons — iOS two-column style */}
        <div className="flex border-t border-zinc-800/80">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors border-r border-zinc-800/80 min-h-[52px]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-4 text-sm font-bold transition-colors min-h-[52px] disabled:opacity-50 ${
              isDanger
                ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/15'
                : 'text-amber-400 hover:bg-amber-400/10 active:bg-amber-400/15'
            }`}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
