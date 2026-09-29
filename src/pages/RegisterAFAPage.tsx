import React, { useState, useMemo } from 'react';
import {
  IonPage,
  IonToast,
} from '@ionic/react';
import {
  CheckCircle,
  User,
  Phone,
  CreditCard,
  MapPin,
  Calendar,
  Briefcase,
  Wallet,
  ArrowRight,
  ShieldCheck,
  Clock,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useHistory } from 'react-router-dom';
import { registrationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useAfaPricing, useWalletBalance } from '../hooks/useData';
import { safeNumber } from '../utils/number';
import DashboardLayout from '../layouts/DashboardLayout';
import Card from '../components/Card';
import AmountDisplay from '../components/AmountDisplay';
import './RegisterAFAPage.css';

const RegisterAFAPage: React.FC = () => {
  const { user } = useAuthStore();
  const {
    data: afaPricing,
    isLoading: pricingLoading,
    isError: pricingError,
    isFetching: pricingFetching,
  } = useAfaPricing();
  const { data: walletBalance, isLoading: balanceLoading, isError: balanceError } = useWalletBalance();
  const queryClient = useQueryClient();
  const history = useHistory();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [ghanaCardNumber, setGhanaCardNumber] = useState('');
  const [location, setLocation] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [occupation, setOccupation] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionData, setSubmissionData] = useState<any>(null);
  const [toast, setToast] = useState({ show: false, message: '', color: '' as 'success' | 'danger' | '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Set when the server rejects a submit because the displayed fee changed.
  const [priceChanged, setPriceChanged] = useState(false);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
    await queryClient.invalidateQueries({ queryKey: ['walletBalance', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });
  };

  // ─── PRICING ───
  // Resolved server-side from the caller's role. No local fallback: if the
  // price cannot be loaded the submit button stays disabled rather than
  // charging an assumed amount.
  const pricingReady = !pricingLoading && !pricingError && afaPricing != null;
  const registrationPrice = safeNumber(afaPricing?.price);
  const maxTopup = safeNumber(afaPricing?.max_topup);
  const exceedsMaxTopup = pricingReady && maxTopup > 0 && registrationPrice > maxTopup;

  // Balance
  const currentBalance = walletBalance ?? safeNumber(user?.wallet_balance);
  const canAfford = pricingReady && currentBalance >= registrationPrice;
  const balanceReady = pricingReady && !balanceLoading;

  // Validation
  const validate = (showAll = false): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (showAll || touched.fullName) {
      if (!fullName.trim()) errs.fullName = 'Enter the applicant\'s full legal name';
    }
    if (showAll || touched.phone) {
      if (!phone.trim()) errs.phone = 'Enter a valid Ghana phone number';
      else if (!/^\d{10}$/.test(phone.trim())) errs.phone = 'Must be exactly 10 digits (e.g. 0241234567)';
    }
    if (showAll || touched.ghanaCardNumber) {
      if (!ghanaCardNumber.trim()) errs.ghanaCardNumber = 'Enter the Ghana Card number';
    }
    if (showAll || touched.location) {
      if (!location.trim()) errs.location = 'Enter the applicant\'s location or address';
    }
    if (showAll || touched.dateOfBirth) {
      if (!dateOfBirth) errs.dateOfBirth = 'Select the date of birth';
    }
    if (showAll || touched.occupation) {
      if (!occupation.trim()) errs.occupation = 'Enter the applicant\'s occupation';
    }
    return errs;
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const errs = validate(false);
    setFieldErrors(errs);
  };

  const handleChange = (field: string, value: string, setter: (v: string) => void) => {
    setter(value);
    if (touched[field]) {
      // Re-validate just this field's area
      const newTouched = { ...touched, [field]: true };
      setTouched(newTouched);
      const errs = validate(false);
      setFieldErrors(errs);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    setTouched({
      fullName: true, phone: true, ghanaCardNumber: true,
      location: true, dateOfBirth: true, occupation: true,
    });
    const errs = validate(true);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (!pricingReady) {
      setToast({ show: true, message: 'Loading the current fee. Please wait a moment and try again.', color: 'danger' });
      return;
    }

    if (!canAfford) {
      setToast({ show: true, message: 'Insufficient wallet balance. Please top up first.', color: 'danger' });
      return;
    }

    setLoading(true);
    setPriceChanged(false);
    try {
      const result = await registrationApi.create({
        full_name: fullName.trim(),
        phone: phone.trim(),
        ghana_card_id: ghanaCardNumber.trim(),
        address: location.trim(),
        date_of_birth: dateOfBirth,
        occupation: occupation.trim(),
        // The amount currently displayed on screen. The server uses it ONLY to
        // detect that the price changed; it never decides what is charged.
        expected_amount: registrationPrice,
      });

      setSubmissionData(result);
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['walletBalance', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
    } catch (err: any) {
      if (err?.code === 'PRICE_CHANGED') {
        // Never charge an amount the user has not seen: refresh the price and
        // ask them to confirm the new figure before resubmitting.
        setPriceChanged(true);
        await queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
        await queryClient.invalidateQueries({ queryKey: ['walletBalance', user?.id] });
        setToast({
          show: true,
          message: err.message || 'The registration fee has changed. Please review the new amount and confirm.',
          color: 'danger',
        });
      } else if (err?.code === 'INSUFFICIENT_BALANCE') {
        await queryClient.invalidateQueries({ queryKey: ['walletBalance', user?.id] });
        setToast({ show: true, message: err.message || 'Insufficient wallet balance. Please top up first.', color: 'danger' });
      } else {
        setToast({ show: true, message: err.message || 'Submission failed. Please try again.', color: 'danger' });
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── SUCCESS STATE ───
  if (submitted) {
    return (
      <IonPage>
        <DashboardLayout onRefresh={handleRefresh}>
          <div className="afa-page">
            <Card
              className="afa-success-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="afa-success-icon-wrap">
                <CheckCircle size={48} />
              </div>
              <h2 className="afa-success-title">Registration Submitted</h2>

              {submissionData?.id && (
                <div className="afa-success-id">
                  <span className="afa-success-id-label">Registration ID</span>
                  <span className="afa-success-id-value">{submissionData.id.slice(0, 8).toUpperCase()}</span>
                </div>
              )}

              <div className="afa-success-details">
                <div className="afa-success-detail">
                  <Clock size={16} />
                  <span>Status: <strong>Pending Review</strong></span>
                </div>
                <div className="afa-success-detail">
                  <CreditCard size={16} />
                  <span>Fee charged: <strong><AmountDisplay value={safeNumber(submissionData?.fee_charged) || registrationPrice} showToggle={false} /></strong></span>
                </div>
                {submissionData?.new_balance != null && (
                  <div className="afa-success-detail">
                    <Wallet size={16} />
                    <span>New balance: <strong><AmountDisplay value={safeNumber(submissionData.new_balance)} showToggle={false} /></strong></span>
                  </div>
                )}
              </div>

              <p className="afa-success-note">
                Our team will review your registration within 24–48 hours.
                You can track the status in your Orders.
              </p>

              <button className="afa-success-btn" onClick={() => history.push('/orders')}>
                <FileText size={16} />
                View My Orders
                <ArrowRight size={16} />
              </button>
            </Card>
          </div>
        </DashboardLayout>
      </IonPage>
    );
  }

  // ─── FORM STATE ───
  return (
    <IonPage>
      <DashboardLayout onRefresh={handleRefresh}>
        <div className="afa-page">

          {/* ─── HEADER ─── */}
          <div className="afa-header">
            <div className="afa-header-icon-wrap">
              <FileText size={20} />
            </div>
            <div className="afa-header-text">
              <h1 className="afa-header-title">Register AFA</h1>
              <p className="afa-header-sub">
                Submit your details to register as an MTN AFA user using the USSD code *1848#. A one-time registration fee applies, and your application will be reviewed within 1 hour.
              </p>
            </div>
          </div>

          {(pricingError || balanceError) && (
            <Card className="afa-balance-card afa-balance-card--insufficient">
              <div className="afa-insufficient">
                <AlertTriangle size={16} />
                <span>
                  {pricingError
                    ? 'Failed to load the current registration fee. Submission stays disabled until it loads. '
                    : 'Failed to load your wallet balance. '}
                </span>
                <button className="afa-topup-btn" onClick={handleRefresh}>Retry</button>
              </div>
            </Card>
          )}

          {/* ─── FEE + BALANCE CARD ─── */}
          <Card className={`afa-balance-card ${!canAfford && balanceReady ? 'afa-balance-card--insufficient' : ''}`}>
            <div className="afa-balance-row">
              <div className="afa-balance-item">
                <div className="afa-balance-icon-wrap">
                  <CreditCard size={18} />
                </div>
                <div className="afa-balance-data">
                  <span className="afa-balance-label">Registration Fee</span>
                  <span className="afa-balance-amount">
                    {pricingLoading ? (
                      '…'
                    ) : pricingError || !pricingReady ? (
                      '—'
                    ) : (
                      <AmountDisplay value={registrationPrice} showToggle={false} />
                    )}
                  </span>
                </div>
              </div>

              <div className="afa-balance-divider" />

              <div className="afa-balance-item">
                <div className="afa-balance-icon-wrap afa-balance-icon-wrap--wallet">
                  <Wallet size={18} />
                </div>
                <div className="afa-balance-data">
                  <span className="afa-balance-label">Your Wallet Balance</span>
                  <span className={`afa-balance-amount ${!canAfford && balanceReady ? 'afa-balance-amount--low' : ''}`}>
                    {balanceLoading ? '...' : <AmountDisplay value={currentBalance} showToggle={false} />}
                  </span>
                </div>
              </div>
            </div>

            {!canAfford && balanceReady && (
              <div className="afa-insufficient">
                <AlertTriangle size={16} />
                <span>Insufficient balance. You need <AmountDisplay value={registrationPrice - currentBalance} showToggle={false} /> more.</span>
                <button className="afa-topup-btn" onClick={() => history.push('/wallet')}>
                  Top Up Wallet
                </button>
              </div>
            )}

            {canAfford && balanceReady && (
              <div className="afa-balance-ok">
                <CheckCircle size={15} />
                <span>Balance sufficient — <AmountDisplay value={currentBalance} showToggle={false} /> available</span>
              </div>
            )}

            {exceedsMaxTopup && (
              <div className="afa-insufficient">
                <AlertTriangle size={16} />
                <span>
                  This fee is above your normal top-up limit. Contact support if you cannot top up this amount.
                </span>
              </div>
            )}
          </Card>

          {/* ─── FORM ─── */}
          <form onSubmit={handleSubmit} className="afa-form" autoComplete="on">

            {/* Section: Personal Information */}
            <div className="afa-section">
              <div className="afa-section-head">
                <User size={16} className="afa-section-icon" />
                <h2 className="afa-section-title">Personal Information</h2>
              </div>

              <div className="afa-field">
                <label className="afa-label" htmlFor="afa-fullname">
                  Full Legal Name <span className="afa-required">*</span>
                </label>
                <input
                  id="afa-fullname"
                  className={`afa-input ${fieldErrors.fullName ? 'afa-input--error' : ''}`}
                  type="text"
                  placeholder="e.g. Kwame Mensah"
                  value={fullName}
                  onChange={(e) => handleChange('fullName', e.target.value, setFullName)}
                  onBlur={() => handleBlur('fullName')}
                  autoComplete="name"
                />
                {fieldErrors.fullName && (
                  <span className="afa-field-error">{fieldErrors.fullName}</span>
                )}
              </div>

              <div className="afa-row">
                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-dob">
                    Date of Birth <span className="afa-required">*</span>
                  </label>
                  <input
                    id="afa-dob"
                    className={`afa-input ${fieldErrors.dateOfBirth ? 'afa-input--error' : ''}`}
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => handleChange('dateOfBirth', e.target.value, setDateOfBirth)}
                    onBlur={() => handleBlur('dateOfBirth')}
                    max={new Date().toISOString().split('T')[0]}
                  />
                  {fieldErrors.dateOfBirth && (
                    <span className="afa-field-error">{fieldErrors.dateOfBirth}</span>
                  )}
                </div>

                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-occupation">
                    Occupation <span className="afa-required">*</span>
                  </label>
                  <input
                    id="afa-occupation"
                    className={`afa-input ${fieldErrors.occupation ? 'afa-input--error' : ''}`}
                    type="text"
                    placeholder="e.g. Student, Trader, Teacher"
                    value={occupation}
                    onChange={(e) => handleChange('occupation', e.target.value, setOccupation)}
                    onBlur={() => handleBlur('occupation')}
                    autoComplete="organization-title"
                  />
                  {fieldErrors.occupation && (
                    <span className="afa-field-error">{fieldErrors.occupation}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Section: Contact & Identity */}
            <div className="afa-section">
              <div className="afa-section-head">
                <CreditCard size={16} className="afa-section-icon" />
                <h2 className="afa-section-title">Contact & Identity</h2>
              </div>

              <div className="afa-row">
                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-phone">
                    Phone Number <span className="afa-required">*</span>
                  </label>
                  <input
                    id="afa-phone"
                    className={`afa-input ${fieldErrors.phone ? 'afa-input--error' : ''}`}
                    type="tel"
                    inputMode="numeric"
                    placeholder="0241234567"
                    value={phone}
                    onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10), setPhone)}
                    onBlur={() => handleBlur('phone')}
                    autoComplete="tel-national"
                  />
                  <span className="afa-field-hint">10-digit Ghana phone number starting with 0</span>
                  {fieldErrors.phone && (
                    <span className="afa-field-error">{fieldErrors.phone}</span>
                  )}
                </div>

                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-ghanacard">
                    Ghana Card Number <span className="afa-required">*</span>
                  </label>
                  <input
                    id="afa-ghanacard"
                    className={`afa-input ${fieldErrors.ghanaCardNumber ? 'afa-input--error' : ''}`}
                    type="text"
                    placeholder="GHA-000000000-0"
                    value={ghanaCardNumber}
                    onChange={(e) => handleChange('ghanaCardNumber', e.target.value.toUpperCase(), setGhanaCardNumber)}
                    onBlur={() => handleBlur('ghanaCardNumber')}
                  />
                  <span className="afa-field-hint">Found on your Ghana Card (e.g. GHA-123456789-0)</span>
                  {fieldErrors.ghanaCardNumber && (
                    <span className="afa-field-error">{fieldErrors.ghanaCardNumber}</span>
                  )}
                </div>
              </div>

              <div className="afa-field">
                <label className="afa-label" htmlFor="afa-location">
                  Location / Address <span className="afa-required">*</span>
                </label>
                <input
                  id="afa-location"
                  className={`afa-input ${fieldErrors.location ? 'afa-input--error' : ''}`}
                  type="text"
                  placeholder="e.g. Tafo, Kumasi"
                  value={location}
                  onChange={(e) => handleChange('location', e.target.value, setLocation)}
                  onBlur={() => handleBlur('location')}
                  autoComplete="address-level2"
                />
                <span className="afa-field-hint">Town or area where the applicant is located</span>
                {fieldErrors.location && (
                  <span className="afa-field-error">{fieldErrors.location}</span>
                )}
              </div>
            </div>

            {/* Trust signal */}
            <div className="afa-trust">
              <ShieldCheck size={15} />
              <span>Your information is encrypted and handled securely in compliance with Ghana data protection regulations.</span>
            </div>

            {/* Fee changed while the form was open: the user must re-confirm */}
            {priceChanged && pricingReady && (
              <div className="afa-insufficient" role="alert">
                <AlertTriangle size={16} />
                <span>
                  The fee changed to <AmountDisplay value={registrationPrice} showToggle={false} />. Confirm the new amount to continue.
                </span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className={`afa-submit-btn ${(!canAfford && balanceReady) || !pricingReady || pricingFetching ? 'afa-submit-btn--disabled' : ''}`}
              disabled={loading || !pricingReady || pricingFetching || (!canAfford && balanceReady)}
            >
              {loading ? (
                <>
                  <span className="afa-spinner" />
                  Submitting Registration…
                </>
              ) : !pricingReady || pricingFetching ? (
                <>Loading fee…</>
              ) : priceChanged ? (
                <>
                  Confirm Updated Fee — <AmountDisplay value={registrationPrice} showToggle={false} />
                  <ArrowRight size={18} />
                </>
              ) : (
                <>
                  Submit Registration — <AmountDisplay value={registrationPrice} showToggle={false} />
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {pricingReady === false && !pricingError && (
              <p className="afa-submit-note">Loading the current registration fee…</p>
            )}
            {pricingError && (
              <p className="afa-submit-note">Registration fee unavailable — tap Retry above.</p>
            )}

            {!canAfford && balanceReady && (
              <p className="afa-submit-note">Top up your wallet to proceed with registration.</p>
            )}
          </form>
        </div>

        <IonToast
          isOpen={toast.show}
          message={toast.message}
          duration={3000}
          onDidDismiss={() => setToast({ show: false, message: '', color: '' })}
          color={toast.color || undefined}
        />
      </DashboardLayout>
    </IonPage>
  );
};

export default RegisterAFAPage;
