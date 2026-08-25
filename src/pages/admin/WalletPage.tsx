import React, { useState } from 'react';
import {
  IonContent,
  IonPage,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonCard,
  IonCardContent,
  IonToast,
  IonTextarea,
  IonAlert,
} from '@ionic/react';
import {
  searchOutline,
  walletOutline,
  addOutline,
  removeOutline,
  snowOutline,
  sunnyOutline,
  chevronDownOutline,
  chevronUpOutline,
  arrowForwardOutline,
  arrowBackOutline,
  closeOutline,
  timeOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { walletApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate } from '../../utils/date';
import './WalletPage.css';

const WalletPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmMsg, setConfirmMsg] = useState('');
  const [txType, setTxType] = useState<'credit' | 'debit'>('credit');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: profiles = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_wallets'],
    queryFn: () => walletApi.adminListUsers() as any,
  });

  const { data: txHistory } = useQuery({
    queryKey: ['admin_wallet_tx', expandedId],
    queryFn: () => walletApi.adminListTransactions(expandedId!) as any,
    enabled: !!expandedId,
  });

  const totalBalance = profiles.reduce((sum: number, p: any) => sum + Number(p.wallet_balance || 0), 0);

  const filtered = profiles.filter((p: any) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openTxModal = (profile: any, type: 'credit' | 'debit') => {
    setSelectedWallet(profile);
    setTxType(type);
    setTxAmount('');
    setTxDescription('');
    setShowTxModal(true);
  };

  const handleTxSubmit = async () => {
    if (!selectedWallet || !txAmount || parseFloat(txAmount) <= 0) return;
    setSubmitting(true);
    try {
      const amount = parseFloat(txAmount);
      if (txType === 'credit') {
        await walletApi.adminCredit(selectedWallet.id, amount, txDescription || 'Manual credit by admin');
      } else {
        await walletApi.adminDebit(selectedWallet.id, amount, txDescription || 'Manual debit by admin');
      }
      queryClient.invalidateQueries({ queryKey: ['admin_wallets'] });
      queryClient.invalidateQueries({ queryKey: ['admin_wallet_tx'] });
      setShowTxModal(false);
      setToastMessage(`${txType === 'credit' ? 'Credited' : 'Debited'} GH₵ ${Number(amount ?? 0).toFixed(2)} ${txType === 'credit' ? 'to' : 'from'} ${selectedWallet.full_name}`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Transaction failed');
      setShowToast(true);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFreeze = (profile: any) => {
    setConfirmMsg(`Are you sure you want to ${profile.wallet_status === 'frozen' ? 'unfreeze' : 'freeze'} ${profile.full_name}'s wallet?`);
    setConfirmAction(async () => {
      const frozen = profile.wallet_status === 'frozen';
      await walletApi.adminUpdateStatus(profile.id, frozen ? 'active' : 'frozen');
      queryClient.invalidateQueries({ queryKey: ['admin_wallets'] });
      setToastMessage(`${profile.full_name}'s wallet has been ${frozen ? 'unfrozen' : 'frozen'}`);
      setShowToast(true);
    });
    setShowConfirm(true);
  };

  const showToastMsg = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_wallets'] });
    await queryClient.invalidateQueries({ queryKey: ['admin_wallet_tx'] });
  };

  return (
    <AdminLayout onRefresh={handleRefresh}>
      <div className="admin-wallet-page">
        <motion.div
          className="wallet-total-card"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="wallet-total-top">
            <IonIcon icon={walletOutline} className="wallet-total-icon" />
            <span className="wallet-total-label">Total Wallet Balance</span>
          </div>
          <div className="wallet-total-amount">GH₵ {totalBalance.toFixed(2)}</div>
          <div className="wallet-total-sub">{profiles.length} wallets</div>
        </motion.div>

        <div className="wallet-section">
          <div className="search-bar">
            <IonIcon icon={searchOutline} className="search-icon" />
            <input type="text" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
          </div>

          <div className="wallets-list">
            {isLoading ? (
              <div className="empty-state">
                <IonIcon icon={walletOutline} />
                <p>Loading wallets...</p>
              </div>
            ) : isError ? (
              <div className="empty-state">
                <IonIcon icon={walletOutline} />
                <p>Failed to load wallets. Please try again.</p>
                <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
              </div>
            ) : (
              <AnimatePresence>
                {filtered.map((profile: any, index: number) => (
                  <motion.div
                    key={profile.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.03 }}
                    className="wallet-card-wrapper"
                  >
                    <div className="wallet-card" onClick={() => toggleExpand(profile.id)}>
                      <div className="wallet-main">
                        <div className="wallet-avatar">{(profile.full_name || 'U').charAt(0)}</div>
                        <div className="wallet-info">
                          <span className="wallet-user-name">{profile.full_name || 'Unknown'}</span>
                          <span className="wallet-email">{profile.email}</span>
                        </div>
                        <div className="wallet-meta">
                          <span className="wallet-balance">GH₵ {Number(profile.wallet_balance || 0).toFixed(2)}</span>
                          <span className={`wallet-status ${profile.wallet_status !== 'frozen' ? 'ws-active' : 'ws-frozen'}`}>
                            {profile.wallet_status === 'frozen' ? 'Frozen' : 'Active'}
                          </span>
                        </div>
                        <div className="wallet-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="wallet-action-btn credit-btn" onClick={() => openTxModal(profile, 'credit')} title="Credit">
                            <IonIcon icon={addOutline} />
                          </button>
                          <button className="wallet-action-btn debit-btn" onClick={() => openTxModal(profile, 'debit')} title="Debit">
                            <IonIcon icon={removeOutline} />
                          </button>
                          <button
                            className={`wallet-action-btn ${profile.wallet_status !== 'frozen' ? 'freeze-btn' : 'unfreeze-btn'}`}
                            onClick={() => toggleFreeze(profile)}
                            title={profile.wallet_status === 'frozen' ? 'Unfreeze' : 'Freeze'}
                          >
                            <IonIcon icon={profile.wallet_status === 'frozen' ? sunnyOutline : snowOutline} />
                          </button>
                        </div>
                        <div className="expand-icon">
                          <IonIcon icon={expandedId === profile.id ? chevronUpOutline : chevronDownOutline} />
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedId === profile.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="wallet-tx-history"
                          >
                            <h4>Transaction History</h4>
                            {!txHistory || txHistory.length === 0 ? (
                              <p className="no-tx">No transactions yet</p>
                            ) : (
                              <div className="tx-list">
                                {txHistory.map((tx: any, i: number) => (
                                  <div key={tx.id || i} className="tx-row">
                                    <div className="tx-side">
                                      <div className={`tx-type-icon ${tx.type === 'credit' ? 'tx-credit' : 'tx-debit'}`}>
                                        <IonIcon icon={tx.type === 'credit' ? arrowForwardOutline : arrowBackOutline} />
                                      </div>
                                      <div className="tx-info">
                                        <span className="tx-desc">{tx.description}</span>
                                        <span className="tx-date">{formatGhanaDate(tx.created_at)}</span>
                                      </div>
                                    </div>
                                    <span className={`tx-amount ${tx.type === 'credit' ? 'tx-amount-credit' : 'tx-amount-debit'}`}>
                                      {tx.type === 'credit' ? '+' : '-'}GH₵ {(tx.amount || 0).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="empty-state">
                <IonIcon icon={walletOutline} />
                <p>No wallets found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <IonModal isOpen={showTxModal} onDidDismiss={() => setShowTxModal(false)} className="tx-modal">
        <div className="modal-header">
          <h2>{txType === 'credit' ? 'Credit Wallet' : 'Debit Wallet'}</h2>
          <button className="modal-close-btn" onClick={() => setShowTxModal(false)}>
            <IonIcon icon={closeOutline} />
          </button>
        </div>
        <div className="modal-body">
          <div className="tx-user-display">
            <div className="tx-user-avatar">{(selectedWallet?.full_name || 'U').charAt(0)}</div>
            <div>
              <span className="tx-user-name">{selectedWallet?.full_name}</span>
              <span className="tx-user-balance">Current Balance: GH₵ {Number(selectedWallet?.wallet_balance || 0).toFixed(2)}</span>
            </div>
          </div>
          <IonItem>
            <IonLabel position="stacked">Amount (GH₵)</IonLabel>
            <IonInput type="number" value={txAmount} onIonChange={(e) => setTxAmount(e.detail.value || '')} placeholder="0.00" />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Description</IonLabel>
            <IonTextarea value={txDescription} onIonChange={(e) => setTxDescription(e.detail.value || '')} placeholder="Reason for transaction..." rows={3} />
          </IonItem>
          <IonButton expand="block" className={`save-btn ${txType === 'debit' ? 'debit-submit' : ''}`} onClick={handleTxSubmit} disabled={!txAmount || parseFloat(txAmount) <= 0 || submitting}>
            {submitting ? 'Processing...' : txType === 'credit' ? 'Credit Wallet' : 'Debit Wallet'}
          </IonButton>
        </div>
      </IonModal>

      <IonAlert
        isOpen={showConfirm}
        onDidDismiss={() => setShowConfirm(false)}
        header="Confirm"
        message={confirmMsg}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Confirm', handler: () => { confirmAction(); } },
        ]}
      />

      <IonToast
        isOpen={showToast}
        onDidDismiss={() => setShowToast(false)}
        message={toastMessage}
        duration={3000}
        position="top"
        color="success"
      />
    </AdminLayout>
  );
};

export default WalletPage;
