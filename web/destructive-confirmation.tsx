import { Form } from 'react-router';
import { useEffect, useId, useRef, useState } from 'react';

export function DestructiveConfirmation({ open, onClose, displayName, email, mode, confirmLabel, fields, busy,
  error, blocked = false }: {
  open: boolean;
  onClose(): void;
  displayName: string;
  email: string;
  mode: 'member' | 'account';
  confirmLabel: string;
  fields: Record<string, string>;
  busy: boolean;
  error?: string | null;
  blocked?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<1 | 2>(1);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      setStage(1);
      setConfirmationEmail('');
      node.showModal();
      queueMicrotask(() => close.current?.focus());
    } else if (!open && node.open) node.close();
  }, [open]);
  useEffect(() => {
    if (open && stage === 2) queueMicrotask(() => confirmation.current?.focus());
  }, [open, stage]);
  const memberCopy = 'Deleting this member disables sign-in, removes personal account data, and removes them from every Group membership. Their Groups remain. Reported Asset history remains attributed to a non-personal deleted-member record.';
  const accountCopy = 'Deleting your account disables sign-in, removes your personal account data, and removes you from every Group membership. Your Groups remain. Reported Asset history remains attributed to a non-personal deleted-member record.';
  return <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={titleId}
    aria-describedby={descriptionId} onClose={onClose}>
    <div className="confirmation-dialog-card">
      <div className="confirmation-header"><h2 id={titleId}>Delete “{displayName}”</h2>
        <button ref={close} type="button" className="dialog-close" aria-label="Close deletion dialog"
          onClick={() => dialog.current?.close()}>×</button></div>
      <div id={descriptionId} className={`confirmation-stage${!blocked && stage === 1 ? ' confirmation-stage-review' : ''}`}>{blocked ? <>
        <h3>Account cannot be deleted</h3>
        <p>This account is the final System administrator and cannot currently be deleted.</p>
        <p>Promote another member to System administrator first.</p>
      </> : stage === 1 ? <>
        <div className="confirmation-warning">This removes the personal account, not its recorded provenance.</div>
        <div className="confirmation-explanation">
          <h3>Review deletion effects</h3>
          <p>{mode === 'member' ? memberCopy : accountCopy}</p>
        </div>
        <button type="button" className="confirmation-continue" onClick={() => setStage(2)}>I understand these effects</button>
      </> : <>
        <h3>Confirm email address</h3>
        <p>To confirm, type “{email}” below.</p>
        <Form method="post" onSubmit={(event) => {
          if (confirmationEmail !== email) event.preventDefault();
        }}>{Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <label htmlFor="deletion-confirmation-email" className="sr-only">Account email</label>
          <input ref={confirmation} id="deletion-confirmation-email" name="confirmationEmail" type="text"
            value={confirmationEmail} autoComplete="off" spellCheck={false}
            onChange={(event) => setConfirmationEmail(event.currentTarget.value)} />
          <button className="danger confirmation-delete" disabled={busy || confirmationEmail !== email}>{confirmLabel}</button>
          {error && <p className="confirmation-error" role="alert">{error.endsWith('.') ? error : error + '.'}</p>}
        </Form>
      </>}</div>
    </div>
  </dialog>;
}
