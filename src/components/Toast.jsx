import { useApp } from '../context/AppContext';
import { X, CheckCircle, AlertCircle, Zap } from 'lucide-react';

const CONFIGS = {
  success: {
    Icon: CheckCircle,
    iconCls: 'text-emerald-400',
    borderCls: 'border-emerald-500/50',
    barCls: 'bg-emerald-400',
    ringCls: 'bg-emerald-400/10',
  },
  error: {
    Icon: AlertCircle,
    iconCls: 'text-red-400',
    borderCls: 'border-red-500/50',
    barCls: 'bg-red-400',
    ringCls: 'bg-red-400/10',
  },
  info: {
    Icon: Zap,
    iconCls: 'text-amber-400',
    borderCls: 'border-amber-500/50',
    barCls: 'bg-amber-400',
    ringCls: 'bg-amber-400/10',
  },
};

export default function ToastStack() {
  const { toasts, removeToast } = useApp();
  if (!toasts.length) return null;

  return (
    <div className="fixed top-14 inset-x-0 z-[100] flex flex-col items-center gap-2 px-3 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }) {
  const cfg = CONFIGS[toast.type] || CONFIGS.info;
  const { Icon } = cfg;
  const duration = toast.duration || 3000;

  return (
    <div className={`toast-enter pointer-events-auto w-full max-w-sm relative overflow-hidden rounded-2xl border ${cfg.borderCls} bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/40`}>
      {/* Body */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Icon ring */}
        <div className={`shrink-0 w-8 h-8 rounded-full ${cfg.ringCls} flex items-center justify-center`}>
          <Icon size={15} className={cfg.iconCls} />
        </div>
        <p className="flex-1 text-sm font-medium text-zinc-100 leading-snug">{toast.message}</p>
        <button
          onClick={() => onRemove(toast.id)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60 transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-800/80">
        <div
          className={`h-full ${cfg.barCls} opacity-70`}
          style={{ animation: `toast-progress ${duration}ms linear forwards` }}
        />
      </div>
    </div>
  );
}
