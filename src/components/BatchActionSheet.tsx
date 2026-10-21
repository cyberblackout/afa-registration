import React, { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { closeOutline, sendOutline, arrowBackOutline } from 'ionicons/icons';
import './BatchActionSheet.css';

export interface BatchAction {
  key: string;
  label: string;
  icon: string;
  destructive?: boolean;
  /**
   * When set, picking this action switches the sheet to a compose step and
   * sends the written message via `onComposeSend`.
   */
  compose?: { placeholder?: string };
  onRun?: () => void;
}

interface BatchActionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Number of selected rows shown in the sheet header. */
  count: number;
  title?: string;
  actions: BatchAction[];
  onComposeSend?: (message: string) => Promise<void> | void;
  onClearSelection?: () => void;
}

/**
 * M3 bottom sheet for multi-select batch actions, with an optional compose
 * step (e.g. "Send notification to N selected users").
 */
export const BatchActionSheet: React.FC<BatchActionSheetProps> = ({
  open,
  onClose,
  count,
  title = 'Batch actions',
  actions,
  onComposeSend,
  onClearSelection,
}) => {
  const [composeAction, setComposeAction] = useState<BatchAction | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setComposeAction(null);
      setMessage('');
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  const handleComposeSend = async () => {
    if (!composeAction || !onComposeSend || !message.trim() || sending) return;
    setSending(true);
    try {
      await onComposeSend(message.trim());
      onClearSelection?.();
      onClose();
    } catch {
      // The invoking page surfaces the error (toast); keep the compose step
      // open so the message isn't lost.
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="m3-batch-scrim" onClick={onClose} aria-hidden="true" />
      <div className="m3-batch-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="m3-sheet-handle" aria-hidden="true" />
        {composeAction ? (
          <div className="m3-batch-compose">
            <div className="m3-batch-compose-header">
              <button
                type="button"
                className="m3-batch-compose-back"
                onClick={() => setComposeAction(null)}
                aria-label="Back to actions"
                disabled={sending}
              >
                <IonIcon icon={arrowBackOutline} />
              </button>
              <div>
                <p className="m3-batch-title">{composeAction.label}</p>
                <p className="m3-batch-subtitle m3-numeric">To {count} selected</p>
              </div>
            </div>
            <textarea
              className="m3-batch-compose-input"
              placeholder={composeAction.compose?.placeholder || 'Type the notification message…'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={sending}
            />
            <button
              type="button"
              className="m3-batch-compose-send"
              onClick={handleComposeSend}
              disabled={!message.trim() || sending}
            >
              <IonIcon icon={sendOutline} />
              <span>{sending ? 'Sending…' : 'Send notification'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="m3-batch-header">
              <p className="m3-batch-title">{title}</p>
              <p className="m3-batch-subtitle m3-numeric">{count} selected</p>
            </div>
            <div className="m3-batch-actions">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className={`m3-batch-action ${action.destructive ? 'm3-batch-action--destructive' : ''}`}
                  onClick={() => {
                    if (action.compose) {
                      setComposeAction(action);
                      return;
                    }
                    action.onRun?.();
                    onClearSelection?.();
                    onClose();
                  }}
                >
                  <span className="m3-batch-action-icon">
                    <IonIcon icon={action.icon} />
                  </span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="m3-batch-cancel" onClick={onClose}>
              <IonIcon icon={closeOutline} />
              <span>Cancel</span>
            </button>
          </>
        )}
      </div>
    </>
  );
};

/** Sticky selection bar shown above the bottom nav when rows are selected. */
export const BatchBar: React.FC<{ count: number; onActions: () => void; onClear: () => void }> = ({
  count,
  onActions,
  onClear,
}) => (
  <div className="m3-batch-bar" role="status">
    <span className="m3-batch-bar-count m3-numeric">{count} selected</span>
    <div className="m3-batch-bar-actions">
      <button type="button" className="m3-batch-bar-clear" onClick={onClear}>
        Clear
      </button>
      <button type="button" className="m3-batch-bar-cta" onClick={onActions}>
        Actions
      </button>
    </div>
  </div>
);

export default BatchActionSheet;
