// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import Modal from './Modal.jsx';
import { t } from '../i18n/index.js';

// Styled confirmation dialog (replaces the native window.confirm).
export default function ConfirmDialog({
  title = t('common.confirm'), message, confirmLabel = t('common.delete'), cancelLabel = t('common.cancel'),
  danger = true, onConfirm, onClose,
}) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ margin: '0 0 20px', color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
        <button className="btn btn-primary" onClick={confirm} disabled={busy}
          style={danger ? { background: 'var(--red)', borderColor: 'var(--red)' } : undefined}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
