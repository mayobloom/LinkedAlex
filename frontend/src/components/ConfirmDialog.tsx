import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';

type Props = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onOpenSettings?: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel = 'Continue', onOpenSettings, onConfirm, onDismiss }: Props) {
  return (
    <div className="confirm-backdrop" role="presentation" onPointerDown={onDismiss}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onPointerDown={(event) => event.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          {onOpenSettings && (
            <button className="confirm-icon-button" type="button" onClick={onOpenSettings} aria-label="Settings">
              <Settings size={16} />
            </button>
          )}
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
          <button className="primary" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
