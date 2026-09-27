import React, { useState, useRef } from 'react';
import {
  IonPage,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
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
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { walletApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate } from '../../utils/date';
import Card from '../../components/Card';
import { safeNumber } from '../../utils/number';
import './WalletPage.css';

const WalletPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // A ref, NOT useState: passing an async function to a state setter makes
  // React invoke it as an updater, firing the API call when the dialog merely
  // opens and leaving a Promise in state (calling it on Confirm then throws
  // "confirmAction is not a function", the dialog never dismisses and the
  // body scroll lock + root aria-hidden leak site-wide).
  const confirmActionRef = useRef<() => void>(() => {});
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

  const totalBalance = profiles.reduce((sum: number, p: any) => sum + safeNumber(p.wallet_balance), 0);

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
      setToastMessage(`${txType === 'credit' ? 'Credited' : 'Debited'} GH₵ ${safeNumber(amount).toFixed(2)} ${txType === 'credit' ? 'to' : 'from'} ${selectedWallet.full_name}`);
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
    confirmActionRef.current = async () => {
      try {
        const frozen = profile.wallet_status === 'frozen';
        await walletApi.adminUpdateStatus(profile.id, frozen ? 'active' : 'frozen');
        queryClient.invalidateQueries({ queryKey: ['admin_wallets'] });
        setToastMessage(`${profile.full_name}'s wallet has been ${frozen ? 'unfrozen' : 'frozen'}`);
        setShowToast(true);
      } catch (err: any) {
        setToastMessage(err.message || 'Failed to update wallet status');
        setShowToast(true);
      }
    };
    setShowConfirm(true);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_wallets'] });
    await queryClient.invalidateQueries({ queryKey: ['admin_wallet_tx'] });
  };

  const activeWallets = profiles.filter((p: any) => p.wallet_status !== 'frozen').length;
  const frozenWallets = profiles.filter((p: any) => p.wallet_status === 'frozen').length;

  return (
    <IonPage>
      <AdminLayout onRefresh={handleRefresh}>
        <div className="admin-wallet-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={walletOutline} className="page-icon" />
            <h1>Wallets</h1>
            <span className="page-count">{profiles.length} wallets</span>
          </div>
          <div className="search-bar">
            <IonIcon icon={searchOutline} className="search-icon" />
            <input type="text" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
          </div>
        </motion.div>

        <div className="wallet-summary">
          <motion.div className="stat-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
            <div className="stat-card-icon" style={{ background: 'rgba(46, 125, 50, 0.08)', color: '#2e7d32' }}>
              <IonIcon icon={walletOutline} />
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">Total Balance</span>
              <span className="stat-card-value">GH₵ {totalBalance.toFixed(2)}</span>
            </div>
          </motion.div>
          <motion.div className="stat-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <div className="stat-card-icon" style={{ background: 'rgba(21, 101, 192, 0.08)', color: '#1565c0' }}>
              <IonIcon icon={sunnyOutline} />
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">Active</span>
              <span className="stat-card-value">{activeWallets}</span>
            </div>
          </motion.div>
          <motion.div className="stat-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#f57f17' }}>
              <IonIcon icon={snowOutline} />
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">Frozen</span>
              <span className="stat-card-value">{frozenWallets}</span>
            </div>
          </motion.div>
          <motion.div className="stat-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
            <div className="stat-card-icon" style={{ background: 'rgba(255, 203, 5, 0.12)', color: '#b39500' }}>
              <IonIcon icon={addOutline} />
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">Total Wallets</span>
              <span className="stat-card-value">{profiles.length}</span>
            </div>
          </motion.div>
        </div>

        <div className="wallets-section">
          {isLoading ? (
            <div className="empty-state">
              <IonIcon icon={walletOutline} className="empty-icon" />
              <p>Loading wallets...</p>
            </div>
          ) : isError ? (
            <div className="empty-state">
              <IonIcon icon={walletOutline} className="empty-icon" />
              <p>Failed to load wallets. Please try again.</p>
              <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
            </div>
          ) : (
            <div className="wallets-list">
              {filtered.length === 0 && (
                <div className="empty-state">
                  <IonIcon icon={walletOutline} className="empty-icon" />
                  <p>No wallets found</p>
                </div>
              )}
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
                    <Card hover noPadding className="wallet-card" onClick={() => toggleExpand(profile.id)}>
                      <div className="wallet-main">
                        <div className="wallet-avatar">{(profile.full_name || 'U').charAt(0)}</div>
                        <div className="wallet-info">
                          <span className="wallet-user-name">{profile.full_name || 'Unknown'}</span>
                          <span className="wallet-email">{profile.email}</span>
                        </div>
                        <div className="wallet-meta">
                          <span className="wallet-balance">GH₵ {safeNumber(profile.wallet_balance).toFixed(2)}</span>
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
                                      {tx.type === 'credit' ? '+' : '-'}GH₵ {safeNumber(tx.amount).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>

      {/* Overlays must live at IonPage level, outside IonContent's scroll
          container — nested overlays leave backdrops that trap pointer
          events / lock scroll with no console error. */}
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
              <span className="tx-user-balance">Current Balance: GH₵ {safeNumber(selectedWallet?.wallet_balance).toFixed(2)}</span>
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
          {
            text: 'Confirm',
            handler: () => {
              // Never let the action throw here: an exception in an Ionic
              // button handler aborts dismiss() and strands the dialog.
              try {
                confirmActionRef.current();
              } catch {
                /* failures surface via the toast inside the action itself */
              }
            },
          },
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
    </IonPage>
  );
};

export default WalletPage;
