import React, { useState, useEffect, useCallback } from 'react';
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
  filterOutline,
  downloadOutline,
  addOutline,
  checkmarkCircle,
  closeCircle,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
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

// Load Paystack Inline script once
let paystackScriptLoaded = false;
const loadPaystackScript = (): Promise<void> => {
  if (paystackScriptLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="paystack"]')) {
      paystackScriptLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => { paystackScriptLoaded = true; resolve(); };
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

  const presetAmounts = [50, 100, 200, 500, 1000];

  // Load Paystack script on mount
  useEffect(() => { loadPaystackScript().catch(() => {}); }, []);

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
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
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DbTransaction[];
    },
    enabled: !!user?.id,
  });

  // Fetch Paystack config from DB (public key + currency)
  const { data: paystackConfig } = useQuery({
    queryKey: ['paystack-config'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_paystack_config');
      if (error) throw error;
      return data as { public_key: string; currency: string };
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('wallet-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_transactions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const creditWalletMutation = useMutation({
    mutationFn: async ({ amount, reference, method }: { amount: number; reference: string; method: string }) => {
      const { error } = await supabase.rpc('credit_wallet', {
        p_user_id: user!.id,
        p_amount: amount,
        p_description: `Wallet Top Up via ${method}`,
        p_reference: reference,
      });
      if (error) throw error;

      // Update the payment_method on the transaction
      await supabase
        .from('wallet_transactions')
        .update({ payment_method: method, status: 'Completed' })
        .eq('reference', reference);
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email, phone, wallet_balance')
          .eq('id', user!.id)
          .single();
        const balance = profile?.wallet_balance ?? 0;
        if (profile?.email) {
          const { sendEmail, topUpEmailHtml } = await import('../services/email');
          const now = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          });
          sendEmail(
            profile.email,
            'Wallet Top-Up Confirmed',
            topUpEmailHtml(profile.full_name || 'User', variables.amount, balance, now),
            'transactional'
          );
        }

        if (profile?.phone) {
          const { sendSms } = await import('../services/sms');
          sendSms(
            user!.id,
            profile.phone,
            `MTN AFA: Your wallet has been credited with GH₵ ${variables.amount.toFixed(2)}. New balance: GH₵ ${balance.toFixed(2)}.`,
            'transactional'
          );
        }
        supabase.functions.invoke('send-push', {
          body: {
            user_id: user!.id,
            title: 'Wallet Top-Up Successful',
            body: `Your MTN AFA wallet has been credited with GH₵ ${variables.amount.toFixed(2)}.`,
            url: '/wallet',
            type: 'transactional',
          },
        }).catch(() => {});
      } catch (e) {
        // email and push are non-critical
      }
    },
  });

  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch = txn.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || txn.status === statusFilter;
    const matchesPayment = paymentFilter === 'All' || (txn.payment_method || 'Wallet') === paymentFilter;

    let matchesDate = true;
    if (dateFilter !== 'All') {
      const txnDate = new Date(txn.created_at);
      const now = new Date();
      if (dateFilter === 'Today') {
        matchesDate = txnDate.toDateString() === now.toDateString();
      } else if (dateFilter === 'This Week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchesDate = txnDate >= weekAgo;
      } else if (dateFilter === 'This Month') {
        matchesDate = txnDate.getMonth() === now.getMonth() && txnDate.getFullYear() === now.getFullYear();
      }
    }

    return matchesSearch && matchesStatus && matchesPayment && matchesDate;
  });

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getStatusClass = (status: string) => {
    if (status === 'Completed') return 'status-completed';
    if (status === 'Pending') return 'status-pending';
    return 'status-failed';
  };

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

    const publicKey = paystackConfig?.public_key;
    if (!publicKey || publicKey.length < 10) {
      setTopUpError('Payment is not configured yet. Please contact support.');
      setTopUpStep('failed');
      return;
    }

    try {
      await loadPaystackScript();
    } catch {
      setTopUpError('Failed to load payment system. Check your internet connection.');
      setTopUpStep('failed');
      return;
    }

    setTopUpLoading(true);

    const reference = `AFA-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const currency = paystackConfig?.currency || 'GHS';

    // Paystack amounts are in pesewas (kobo for NGN) — multiply by 100
    const amountInSmallestUnit = Math.round(amount * 100);

    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      setTopUpError('Payment system failed to initialize.');
      setTopUpStep('failed');
      setTopUpLoading(false);
      return;
    }

    const handler = PaystackPop.setup({
      key: publicKey,
      email: user!.email,
      amount: amountInSmallestUnit,
      currency,
      ref: reference,
      channels: ['mobile_money', 'card', 'bank'],
      metadata: {
        custom_fields: [
          { display_name: 'User ID', variable_name: 'user_id', value: user!.id },
          { display_name: 'Purpose', variable_name: 'purpose', value: 'Wallet Top Up' },
        ],
      },
      callback: async (response: any) => {
        // Payment successful
        setTopUpStep('processing');
        try {
          // Determine payment channel from Paystack response
          const method = response.channel === 'mobile_money'
            ? 'Mobile Money'
            : response.channel === 'card'
              ? 'Card'
              : response.channel === 'bank'
                ? 'Bank'
                : 'Paystack';

          await creditWalletMutation.mutateAsync({
            amount,
            reference: response.reference || reference,
            method,
          });
          setPaidAmount(amount);
          setTopUpStep('success');
        } catch (err: any) {
          setTopUpError(err.message || 'Payment received but wallet update failed. Contact support.');
          setTopUpStep('failed');
        } finally {
          setTopUpLoading(false);
        }
      },
      onClose: () => {
        // User closed the popup without completing payment
        if (topUpStep !== 'success' && topUpStep !== 'processing') {
          setTopUpLoading(false);
        }
      },
    });

    handler.openIframe();
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
      `${txn.description},${txn.type === 'credit' ? '+' : '-'}GH₵${txn.amount.toFixed(2)},${new Date(txn.created_at).toLocaleDateString()},${txn.status},${txn.payment_method || 'Wallet'}`
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

  return (
    <IonPage>
        <DashboardLayout>
          <div className="wallet-page">
        <motion.div
          className="balance-card"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="balance-card-top">
            <IonIcon icon={walletOutline} className="wallet-icon" />
            <span className="balance-label">Wallet Balance</span>
          </div>
          <div className="balance-amount">
            {balanceLoading ? '...' : `GH₵ ${(balanceData?.wallet_balance ?? 0).toFixed(2)}`}
          </div>
          <IonButton
            expand="block"
            className="top-up-btn"
            onClick={() => setShowTopUp(true)}
          >
            <IonIcon icon={addOutline} slot="start" />
            Top Up Wallet
          </IonButton>
        </motion.div>

        <div className="transactions-section">
          <div className="section-header">
            <h2>Recent Transactions</h2>
            <IonButton fill="clear" className="export-btn" onClick={exportCSV}>
              <IonIcon icon={downloadOutline} slot="start" />
              Export CSV
            </IonButton>
          </div>

          <div className="filter-bar">
            <div className="search-wrapper">
              <IonIcon icon={searchOutline} className="search-icon" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="search-input"
              />
            </div>

            <div className="filter-selects">
              <div className="filter-item">
                <IonIcon icon={filterOutline} className="filter-icon" />
                <select
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                  className="filter-select"
                >
                  <option value="All">All Dates</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                </select>
              </div>

              <div className="filter-item">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="filter-select"
                >
                  <option value="All">All Status</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>

              <div className="filter-item">
                <select
                  value={paymentFilter}
                  onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
                  className="filter-select"
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
          </div>

          {isLoading ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <IonIcon icon={walletOutline} />
              <p>Loading transactions...</p>
            </motion.div>
          ) : txnsError ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <IonIcon icon={closeCircle} />
              <p>Failed to load transactions. Please try again.</p>
              <IonButton fill="clear" onClick={() => refetchTxns()}>Retry</IonButton>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              {paginatedTransactions.length === 0 ? (
                <motion.div
                  className="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <IonIcon icon={walletOutline} />
                  <p>No transactions found</p>
                </motion.div>
              ) : (
                <motion.div
                  className="transactions-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {paginatedTransactions.map((txn, index) => (
                    <motion.div
                      key={txn.id}
                      className="transaction-item"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className={`txn-icon ${txn.type === 'credit' ? 'icon-credit' : 'icon-debit'}`}>
                        <IonIcon icon={txn.type === 'credit' ? arrowDown : arrowUp} />
                      </div>
                      <div className="txn-info">
                        <span className="txn-description">{txn.description}</span>
                        <span className="txn-date">{new Date(txn.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="txn-right">
                        <span className={`txn-amount ${txn.type === 'credit' ? 'amount-credit' : 'amount-debit'}`}>
                          {txn.type === 'credit' ? '+' : '-'}GH₵{txn.amount.toFixed(2)}
                        </span>
                        <span className={`txn-status ${getStatusClass(txn.status)}`}>{txn.status}</span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`page-btn ${currentPage === page ? 'page-active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                className="page-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

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
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
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
                    {topUpLoading ? 'Opening Paystack...' : `Pay GH₵${getDisplayAmount().toFixed(2)}`}
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
                  <p>GH₵{paidAmount.toFixed(2)} has been added to your wallet.</p>
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
