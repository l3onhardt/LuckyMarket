import { useToastStore_ } from '@/hooks/useToast';
import { X } from 'lucide-react';
import type { Toast } from '@/hooks/useToast';

const ToastItem = ({ toast, onClose }: { toast: Toast; onClose: () => void }) => {
  const typeColors = {
    success: 'border-emerald-500/30 bg-emerald-500/10',
    error: 'border-red-500/30 bg-red-500/10',
    info: 'border-blue-500/30 bg-blue-500/10',
  };

  const textColors = {
    success: 'text-emerald-400',
    error: 'text-red-400',
    info: 'text-blue-400',
  };

  return (
    <div
      className={`fluid-glass-card ${typeColors[toast.type]} flex items-center justify-between gap-3 min-w-[300px] max-w-md`}
    >
      <span className={`${textColors[toast.type]} text-sm font-medium`}>
        {toast.message}
      </span>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore_();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
