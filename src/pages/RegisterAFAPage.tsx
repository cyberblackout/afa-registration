import React, { useState } from 'react';
import {
  IonPage,
  IonToast,
  IonIcon,
} from '@ionic/react';
import { checkmarkCircle } from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useHistory } from 'react-router-dom';
import { registrationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { usePricing } from '../hooks/useData';
import DashboardLayout from '../layouts/DashboardLayout';
import './RegisterAFAPage.css';

const RegisterAFAPage: React.FC = () => {
  const { user } = useAuthStore();
  const { data: pricing } = usePricing();
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
  const [toast, setToast] = useState({ show: false, message: '', color: '' as 'success' | 'danger' | '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['pricing'] });
    await queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });
  };

  // Get AFA registration price from pricing table
  const afaPricing = pricing?.find(
    (p: any) => p.key === 'afa_registration' || p.label?.toLowerCase().includes('afa')
  );
  const registrationPrice = afaPricing?.amount ?? 150;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required';
    if (!phone.trim()) errs.phone = 'Phone number is required';
    else if (!/^\d{10}$/.test(phone.trim())) errs.phone = 'Use 10-digit Ghana format, e.g. 0241234567';
    if (!ghanaCardNumber.trim()) errs.ghanaCardNumber = 'Ghana Card number is required';
    if (!location.trim()) errs.location = 'Location is required';
    if (!dateOfBirth) errs.dateOfBirth = 'Date of birth is required';
    if (!occupation.trim()) errs.occupation = 'Occupation is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await registrationApi.create({
        full_name: fullName.trim(),
        phone: phone.trim(),
        ghana_card_id: ghanaCardNumber.trim(),
        address: location.trim(),
        date_of_birth: dateOfBirth,
        occupation: occupation.trim(),
      });

      setSubmitted(true);
      setToast({ show: true, message: 'Registration submitted successfully!', color: 'success' });

      // Invalidate orders so the Orders page shows the new entry immediately
      queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });

      setTimeout(() => {
        history.push('/orders');
      }, 2500);
    } catch (err: any) {
      setToast({ show: true, message: err.message || 'Submission failed. Please try again.', color: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <IonPage>
        <DashboardLayout onRefresh={handleRefresh}>
          <div className="afa-page">
            <motion.div
              className="afa-success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <IonIcon icon={checkmarkCircle} className="afa-success-icon" />
              <h2>Registration Submitted!</h2>
              <p>Your AFA registration has been submitted for admin review. Redirecting to orders…</p>
            </motion.div>
          </div>
        </DashboardLayout>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <DashboardLayout onRefresh={handleRefresh}>
        <div className="afa-page">
          <div className="afa-card">
            {/* Header */}
            <div className="afa-card-header">
              <h2 className="afa-card-title">Applicant Details</h2>
              <p className="afa-card-subtitle">
                Enter the information exactly as provided by the applicant.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="afa-form" autoComplete="on">
              {/* Full Name – full width */}
              <div className="afa-field full">
                <label className="afa-label" htmlFor="afa-fullname">Full Name *</label>
                <input
                  id="afa-fullname"
                  className={`afa-input ${fieldErrors.fullName ? 'error' : ''}`}
                  type="text"
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                {fieldErrors.fullName && <span className="afa-field-error">{fieldErrors.fullName}</span>}
              </div>

              {/* Phone + Ghana Card – side by side */}
              <div className="afa-row">
                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-phone">Phone Number *</label>
                  <input
                    id="afa-phone"
                    className={`afa-input ${fieldErrors.phone ? 'error' : ''}`}
                    type="tel"
                    placeholder="e.g. 0241234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  {fieldErrors.phone && <span className="afa-field-error">{fieldErrors.phone}</span>}
                </div>
                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-ghanacard">Ghana Card Number *</label>
                  <input
                    id="afa-ghanacard"
                    className={`afa-input ${fieldErrors.ghanaCardNumber ? 'error' : ''}`}
                    type="text"
                    placeholder="E.G. GHA-000000000-0"
                    value={ghanaCardNumber}
                    onChange={(e) => setGhanaCardNumber(e.target.value)}
                  />
                  {fieldErrors.ghanaCardNumber && <span className="afa-field-error">{fieldErrors.ghanaCardNumber}</span>}
                </div>
              </div>

              {/* Location + Date of Birth – side by side */}
              <div className="afa-row">
                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-location">Location *</label>
                  <input
                    id="afa-location"
                    className={`afa-input ${fieldErrors.location ? 'error' : ''}`}
                    type="text"
                    placeholder="e.g. Tafo, Kumasi"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                  {fieldErrors.location && <span className="afa-field-error">{fieldErrors.location}</span>}
                </div>
                <div className="afa-field">
                  <label className="afa-label" htmlFor="afa-dob">Date of Birth *</label>
                  <input
                    id="afa-dob"
                    className={`afa-input ${fieldErrors.dateOfBirth ? 'error' : ''}`}
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                  {fieldErrors.dateOfBirth && <span className="afa-field-error">{fieldErrors.dateOfBirth}</span>}
                </div>
              </div>

              {/* Occupation – full width */}
              <div className="afa-field full">
                <label className="afa-label" htmlFor="afa-occupation">Occupation *</label>
                <input
                  id="afa-occupation"
                  className={`afa-input ${fieldErrors.occupation ? 'error' : ''}`}
                  type="text"
                  placeholder="e.g. Student, Teacher, Business Owner"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                />
                {fieldErrors.occupation && <span className="afa-field-error">{fieldErrors.occupation}</span>}
              </div>

              {/* Pricing Banner */}
              <div className="afa-pricing-banner">
                <div className="afa-pricing-text">
                  <strong>Amount to be charged</strong>
                  <span>Your wallet is charged only after successful validation.</span>
                </div>
                <div className="afa-pricing-total">
                  <span className="afa-pricing-badge">TOTAL</span>
                  <span className="afa-pricing-amount">GH₵ {Number(registrationPrice ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="afa-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="afa-spinner" />
                    Submitting…
                  </>
                ) : (
                  'Submit Registration'
                )}
              </button>
            </form>
          </div>
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
