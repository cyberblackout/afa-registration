import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IonButton,
  IonIcon,
  IonPage,
} from '@ionic/react';
import {
  walletOutline,
  arrowUp,
  arrowDown,
  searchOutline,
  downloadOutline,
  addOutline,
  checkmarkCircle,
  closeCircle,
  shieldCheckmarkOutline,
  timeOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { walletApi, pricingApi, profileApi, notificationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import AmountDisplay from '../components/AmountDisplay';
import Card from '../components/Card';
import {
  formatGhanaDate,
  formatGhanaTimeAgo,
  getGhanaDateLabel,
  isGhanaSameDay,
  isGhanaLastWeek,
  isGhanaSameMonth,
  getGhanaTodayISO,
} from '../utils/date';
import './WalletPage.css';

interface DbTransaction {
  id: string;
  user_id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  reference?: string;
  payment_method?: string;
  status: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

const formatCurrency = (val: number): string => {
  const num = Number(val ?? 0);
  if (isNaN(num)) return '0.00';
  return num.toFixed(2);
};

let paystackScriptLoaded = false;
const loadPaystackScript = (): Promise<void> => {
  if (paystackScriptLoaded && (window as any).PaystackPop) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if ((window as any).PaystackPop) {
      paystackScriptLoaded = true;
      resolve();
      return;
    }
    const existingScript = document.querySelector('script[src*="paystack"]');
    if (existingScript) {
      const checkReady = () => {
        if ((window as any).PaystackPop) {
          paystackScriptLoaded = true;
          resolve();
        }
      };
      existingScript.addEventListener('load', checkReady);
      const interval = setInterval(() => {
        if ((window as any).PaystackPop) {
          clearInterval(interval);
          paystackScriptLoaded = true;
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(interval); reject(new Error('Paystack script timed out')); }, 10000);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => {
      const waitForPop = setInterval(() => {
        if ((window as any).PaystackPop) {
          clearInterval(waitForPop);
          paystackScriptLoaded = true;
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(waitForPop); reject(new Error('Paystack script timed out')); }, 10000);
    };
    script.onerror = () => reject(new Error('Failed to load Paystack'));
    document.head.appendChild(script);
  });
};

const WalletPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [showTopUp, setShowTopUp] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [topUpStep, setTopUpStep] = useState<'form' | 'processing' | 'success' | 'failed'>('form');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['topup-limits'] });
    await queryClient.invalidateQueries({ queryKey: ['wallet', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['wallet-transactions', user?.id] });
  };

  const presetAmounts = [50, 100, 200, 500, 1000];

  useEffect(() => { loadPaystackScript().catch(() => {}); }, []);

  const { data: topUpLimits } = useQuery({
    queryKey: ['topup-limits'],
    queryFn: async () => {
      const allPricing = await pricingApi.get();
      const min = allPricing.find((r: any) => r.key === 'wallet_min_topup')?.amount ?? 10;
      const max = allPricing.find((r: any) => r.key === 'wallet_max_topup')?.amount ?? 10000;
      return { min: Number(min), max: Number(max) };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet', user?.id],
    queryFn: () => profileApi.getWalletBalance(user!.id),
    enabled: !!user?.id,
  });

  const {
    data: transactions = [],
    isLoading: txnsLoading,
    isError: txnsError,
    refetch: refetchTxns,
  } = useQuery({
    queryKey: ['wallet-transactions', user?.id],
    queryFn: async () => {
      const data = await walletApi.getTransactions();
      return (data || []) as DbTransaction[];
    },
    enabled: !!user?.id,
  });

  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('wallet-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch = txn.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || txn.status === statusFilter;
    const matchesPayment = paymentFilter === 'All' || (txn.payment_method || 'Wallet') === paymentFilter;
    let matchesDate = true;
    if (dateFilter !== 'All') {
      if (dateFilter === 'Today') matchesDate = isGhanaSameDay(txn.created_at);
      else if (dateFilter === 'This Week') matchesDate = isGhanaLastWeek(txn.created_at);
      else if (dateFilter === 'This Month') matchesDate = isGhanaSameMonth(txn.created_at);
    }
    return matchesSearch && matchesStatus && matchesPayment && matchesDate;
  });

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const groupedTransactions = useMemo(() => {
    const groups: { label: string; items: DbTransaction[] }[] = [];
    const grouped: Record<string, DbTransaction[]> = {};
    for (const txn of paginatedTransactions) {
      const label = getGhanaDateLabel(txn.created_at);
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(txn);
    }
    const order = ['Today', 'Yesterday', 'This Week', 'Older'];
    for (const label of order) {
      if (grouped[label]?.length) {
        groups.push({ label, items: grouped[label] });
      }
    }
    return groups;
  }, [paginatedTransactions]);

  const handlePresetClick = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (val: string) => {
    setCustomAmount(val);
    setSelectedAmount(null);
  };

  const getDisplayAmount = useCallback(() => {
    if (selectedAmount) return selectedAmount;
    if (customAmount) return parseFloat(customAmount) || 0;
    return 0;
  }, [selectedAmount, customAmount]);

  const handleProceed = async () => {
    const amount = getDisplayAmount();
    if (amount <= 0) return;
    if (topUpLimits) {
      if (amount < topUpLimits.min) {
        setTopUpError(`Minimum top-up amount is GH₵${formatCurrency(topUpLimits.min)}`);
        setTopUpStep('failed');
        return;
      }
      if (amount > topUpLimits.max) {
        setTopUpError(`Maximum top-up amount is GH₵${formatCurrency(topUpLimits.max)}`);
        setTopUpStep('failed');
        return;
      }
    }
    const publicKey = paystackPublicKey;
    if (!publicKey || publicKey.length < 10) {
      setTopUpError('Payment is not configured yet. Please contact support.');
      setTopUpStep('failed');
      return;
    }
    setTopUpLoading(true);
    setTopUpError('');
    try {
      const initResult = await walletApi.initiateTopUp(amount);
      const { access_code, reference } = initResult;
      if (!access_code || !reference) throw new Error('Failed to initialize payment');
      await loadPaystackScript();
      const PaystackPop = (window as any).PaystackPop;
      if (!PaystackPop || typeof PaystackPop.setup !== 'function') {
        throw new Error('Payment system failed to initialize. Please refresh and try again.');
      }
      const handlePaymentCallback = (response: any) => {
        setTopUpStep('processing');
        pollTransactionStatus(reference, amount)
          .catch((err: any) => {
            setTopUpError(err.message || 'Payment verification failed. Contact support.');
            setTopUpStep('failed');
          })
          .finally(() => setTopUpLoading(false));
      };
      const handlePopupClose = () => {
        setTopUpStep((currentStep) => {
          if (currentStep !== 'success' && currentStep !== 'processing') {
            pollTransactionStatus(reference, amount)
              .then(() => {})
              .catch(() => {
                setTopUpError('Payment was cancelled. If you already paid, it will be processed shortly.');
                setTopUpStep('failed');
              })
              .finally(() => setTopUpLoading(false));
            return 'processing';
          }
          return currentStep;
        });
      };
      const config = {
        key: publicKey,
        email: user!.email,
        amount: Math.round(amount * 100),
        currency: 'GHS',
        ref: reference,
        access_code,
        channels: ['mobile_money', 'card', 'bank'],
        callback: handlePaymentCallback,
        onClose: handlePopupClose,
      };
      if (typeof config.callback !== 'function') {
        throw new Error('Payment configuration error. Please try again.');
      }
      const handler = PaystackPop.setup(config);
      if (!handler || typeof handler.openIframe !== 'function') {
        throw new Error('Payment system failed to initialize the checkout. Please try again.');
      }
      handler.openIframe();
    } catch (err: any) {
      setTopUpError(err.message || 'Failed to start payment. Please try again.');
      setTopUpStep('failed');
      setTopUpLoading(false);
    }
  };

  const pollTransactionStatus = async (reference: string, amount: number) => {
    const maxAttempts = 15;
    const intervalMs = 2000;
    for (let i = 0; i < maxAttempts; i++) {
      const result = await walletApi.verifyTopUp(reference);
      if (result.status === 'completed') {
        setPaidAmount(amount);
        setTopUpStep('success');
        sendTopUpNotifications(amount);
        return;
      }
      if (result.status === 'failed') throw new Error('Payment was not successful. Please try again.');
      if (i < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    setPaidAmount(amount);
    setTopUpStep('success');
    sendTopUpNotifications(amount);
  };

  const sendTopUpNotifications = async (amount: number) => {
    try {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone, wallet_balance')
        .eq('id', user!.id)
        .single();
      const balance = Number(profile?.wallet_balance ?? 0);
      if (profile?.email) {
        const { sendEmail, topUpEmailHtml } = await import('../services/email');
        const dateDisplay = new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Accra',
        });
        sendEmail(
          profile.email,
          'Wallet Top-Up Confirmed',
          topUpEmailHtml(profile.full_name || 'User', amount, balance, dateDisplay),
          'transactional'
        );
      }
      if (profile?.phone) {
        const { sendSms } = await import('../services/sms');
        sendSms(
          user!.id,
          profile.phone,
          `MTN AFA: Your wallet has been credited with GH₵ ${amount.toFixed(2)}. New balance: GH₵ ${balance.toFixed(2)}.`,
          'transactional'
        );
      }
      notificationApi.sendPush(
        user!.id,
        'Wallet Top-Up Successful',
        `Your MTN AFA wallet has been credited with GH₵ ${amount.toFixed(2)}.`,
        '/wallet',
        'transactional',
      ).catch(() => {});
    } catch (e) {
      // email and push are non-critical
    }
  };

  const resetTopUp = () => {
    setShowTopUp(false);
    setTopUpStep('form');
    setSelectedAmount(null);
    setCustomAmount('');
    setTopUpLoading(false);
    setTopUpError('');
    setPaidAmount(0);
  };

  const exportCSV = () => {
    const headers = 'Description,Amount,Date,Status,Payment Method\n';
    const rows = filteredTransactions.map((txn) =>
      `${txn.description},${txn.type === 'credit' ? '+' : '-'}GH₵${formatCurrency(txn.amount)},${formatGhanaDate(txn.created_at)},${txn.status},${txn.payment_method || 'Wallet'}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const isLoading = balanceLoading || txnsLoading;
  const hasActiveFilters = searchTerm || statusFilter !== 'All' || paymentFilter !== 'All' || dateFilter !== 'All';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setPaymentFilter('All');
    setDateFilter('All');
    setCurrentPage(1);
  };

  return (
    <IonPage>
      <DashboardLayout onRefresh={handleRefresh}>
        <div className="wallet-page">

          {/* ── Balance Hero ── */}
          <motion.div
            className="wallet-hero"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="wallet-hero-glow" />
            <div className="wallet-hero-glow wallet-hero-glow--alt" />
            <div className="wallet-hero-content">
              <div className="wallet-hero-badge">
                <IonIcon icon={walletOutline} />
                <span>Available Balance</span>
              </div>
              <div className="wallet-hero-amount-row">
                {balanceLoading ? (
                  <div className="wallet-hero-amount-display">
                    <span className="wallet-hero-skeleton">...</span>
                  </div>
                ) : (
                  <AmountDisplay
                    value={balanceData?.wallet_balance ?? 0}
                    className="amount-display--dark wallet-hero-amount-display"
                  />
                )}
              </div>
              <IonButton
                expand="block"
                className="wallet-hero-btn"
                onClick={() => setShowTopUp(true)}
              >
                <IonIcon icon={addOutline} slot="start" />
                Top Up Wallet
              </IonButton>
              <div className="wallet-hero-secure">
                <IonIcon icon={shieldCheckmarkOutline} />
                <span>Secured by Paystack</span>
              </div>
              <div className="wallet-hero-id">
                <span className="wallet-hero-id-label">
                  Wallet ID: ••••{(user?.id ?? '').slice(-4)}
                </span>
                <span className="wallet-hero-id-dot" />
                <span className="wallet-hero-id-status">Protected • Private</span>
              </div>
            </div>
          </motion.div>

          {/* ── Transactions Section ── */}
          <Card noPadding className="wallet-txns-card">
            <div className="wallet-txns-header">
              <h2>Transactions</h2>
              <div className="wallet-txns-header-actions">
                {hasActiveFilters && (
                  <button className="wallet-clear-btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
                <button className="wallet-export-btn" onClick={exportCSV}>
                  <IonIcon icon={downloadOutline} />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* ── Filter Bar ── */}
            <div className="wallet-filters">
              <div className="wallet-search">
                <IonIcon icon={searchOutline} className="wallet-search-icon" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="wallet-search-input"
                />
              </div>
              <div className="wallet-filter-row">
                <select
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                  className="wallet-filter-chip"
                >
                  <option value="All">All Dates</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="wallet-filter-chip"
                >
                  <option value="All">All Status</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Failed">Failed</option>
                </select>
                <select
                  value={paymentFilter}
                  onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
                  className="wallet-filter-chip"
                >
                  <option value="All">All Methods</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Card">Card</option>
                  <option value="Bank">Bank</option>
                  <option value="Wallet">Wallet</option>
                  <option value="System">System</option>
                </select>
              </div>
            </div>

            {/* ── Transaction List ── */}
            {isLoading ? (
              <div className="wallet-skeleton">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="wallet-skeleton-card">
                    <div className="wallet-skeleton-icon" />
                    <div className="wallet-skeleton-body">
                      <div className="wallet-skeleton-line wallet-skeleton-line--wide" />
                      <div className="wallet-skeleton-line wallet-skeleton-line--narrow" />
                    </div>
                    <div className="wallet-skeleton-amount" />
                  </div>
                ))}
              </div>
            ) : txnsError ? (
              <div className="wallet-empty wallet-empty--error">
                <div className="wallet-empty-icon wallet-empty-icon--error">
                  <IonIcon icon={closeCircle} />
                </div>
                <h3>Something went wrong</h3>
                <p>Failed to load transactions. Please try again.</p>
                <IonButton fill="clear" className="wallet-empty-retry" onClick={() => refetchTxns()}>
                  Retry
                </IonButton>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {filteredTransactions.length === 0 ? (
                  <motion.div
                    className="wallet-empty"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="wallet-empty-icon">
                      <IonIcon icon={walletOutline} />
                    </div>
                    <h3>{hasActiveFilters ? 'No matching transactions' : 'Your wallet is waiting'}</h3>
                    <p>
                      {hasActiveFilters
                        ? 'Try adjusting your search or filters.'
                        : 'Top up to get started with MTN AFA services.'
                      }
                    </p>
                    {!hasActiveFilters && (
                      <IonButton className="wallet-empty-cta" onClick={() => setShowTopUp(true)}>
                        <IonIcon icon={addOutline} slot="start" />
                        Top Up Wallet
                      </IonButton>
                    )}
                    {hasActiveFilters && (
                      <IonButton fill="clear" className="wallet-empty-retry" onClick={clearFilters}>
                        Clear filters
                      </IonButton>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    className="wallet-txns-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {groupedTransactions.map((group) => (
                      <div key={group.label} className="wallet-txn-group">
                        <div className="wallet-txn-group-label">{group.label}</div>
                        {group.items.map((txn, index) => (
                          <motion.div
                            key={txn.id}
                            className="wallet-txn"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.03 }}
                          >
                            <div className={`wallet-txn-icon wallet-txn-icon--${txn.type}`}>
                              <IonIcon icon={txn.type === 'credit' ? arrowDown : arrowUp} />
                            </div>
                            <div className="wallet-txn-body">
                              <div className="wallet-txn-top">
                                <span className="wallet-txn-desc">{txn.description}</span>
                                <span className={`wallet-txn-amount wallet-txn-amount--${txn.type}`}>
                                  {txn.type === 'credit' ? '+' : '−'}GH₵ {formatCurrency(txn.amount)}
                                </span>
                              </div>
                              <div className="wallet-txn-bottom">
                                <span className="wallet-txn-time">{formatGhanaTimeAgo(txn.created_at)}</span>
                                <span className={`wallet-txn-status wallet-txn-status--${(txn.status || '').toLowerCase()}`}>
                                  {(txn.status || '').toLowerCase() === 'completed' && <IonIcon icon={checkmarkCircle} />}
                                  {(txn.status || '').toLowerCase() === 'pending' && <IonIcon icon={timeOutline} />}
                                  {(txn.status || '').toLowerCase() === 'failed' && <IonIcon icon={closeCircle} />}
                                  {txn.status}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="wallet-pagination">
                <button
                  className="wallet-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    className={`wallet-page-btn ${currentPage === page ? 'wallet-page-btn--active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="wallet-page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </Card>
        </div>

        {/* ── Top-Up Modal ── */}
        <AnimatePresence>
          {showTopUp && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetTopUp}
            >
              <motion.div
                className="modal-content"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
              >
                {topUpStep === 'form' && (
                  <div className="top-up-form">
                    <div className="modal-header">
                      <h3>Top Up Wallet</h3>
                      <button className="modal-close" onClick={resetTopUp}>
                        <IonIcon icon={closeCircle} />
                      </button>
                    </div>

                    <div className="paystack-badge">
                      <IonIcon icon={shieldCheckmarkOutline} />
                      <span>Secured by Paystack</span>
                    </div>

                    <div className="preset-amounts">
                      <label className="modal-label">Select Amount</label>
                      <div className="preset-grid">
                        {presetAmounts.map((amt) => (
                          <button
                            key={amt}
                            className={`preset-btn ${selectedAmount === amt ? 'preset-active' : ''}`}
                            onClick={() => handlePresetClick(amt)}
                          >
                            GH₵{amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="custom-amount">
                      <label className="modal-label">Or enter custom amount</label>
                      <div className="custom-input-wrap">
                        <span className="currency-prefix">GH₵</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={customAmount}
                          onChange={(e) => handleCustomAmountChange(e.target.value)}
                          className="custom-input"
                          min="1"
                        />
                      </div>
                    </div>

                    <div className="payment-info">
                      <p>You'll be redirected to Paystack to complete payment via Mobile Money, Card, or Bank.</p>
                    </div>

                    <IonButton
                      expand="block"
                      className="proceed-btn"
                      onClick={handleProceed}
                      disabled={getDisplayAmount() <= 0 || topUpLoading}
                    >
                      {topUpLoading ? 'Opening Paystack...' : `Pay GH₵${formatCurrency(getDisplayAmount())}`}
                    </IonButton>
                  </div>
                )}

                {topUpStep === 'processing' && (
                  <div className="top-up-result result-processing">
                    <div className="processing-spinner" />
                    <h3>Processing Payment...</h3>
                    <p>Please wait while we confirm your payment and credit your wallet.</p>
                  </div>
                )}

                {topUpStep === 'success' && (
                  <div className="top-up-result result-success">
                    <IonIcon icon={checkmarkCircle} className="result-icon" />
                    <h3>Payment Successful!</h3>
                    <p>GH₵{formatCurrency(paidAmount)} has been added to your wallet.</p>
                    <IonButton expand="block" className="proceed-btn" onClick={resetTopUp}>
                      Done
                    </IonButton>
                  </div>
                )}

                {topUpStep === 'failed' && (
                  <div className="top-up-result result-failed">
                    <IonIcon icon={closeCircle} className="result-icon" />
                    <h3>Payment Failed</h3>
                    <p>{topUpError || 'Something went wrong. Please try again.'}</p>
                    <IonButton expand="block" className="proceed-btn" onClick={() => { setTopUpStep('form'); setTopUpError(''); setTopUpLoading(false); }}>
                      Try Again
                    </IonButton>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </DashboardLayout>
    </IonPage>
  );
};

export default WalletPage;
