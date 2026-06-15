import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode; // 确认详情内容
  confirmLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel = '确认',
  onConfirm,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fluid-glass-card fixed left-1/2 top-1/2 z-[70] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 p-6">
          <Dialog.Title className="text-xl font-semibold text-white">{title}</Dialog.Title>
          <div className="mt-4 space-y-2 text-sm text-slate-200">{children}</div>
          <div className="mt-6 flex gap-3">
            <Dialog.Close className="min-h-[48px] flex-1 rounded-xl bg-white/10 px-4 text-base font-medium text-white hover:bg-white/20">
              取消
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="outcome-yes min-h-[48px] flex-1 rounded-xl px-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
