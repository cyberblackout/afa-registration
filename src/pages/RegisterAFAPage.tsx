import React, { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  IonPage,
  IonInput,
  IonButton,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonToast,
  IonIcon,
} from '@ionic/react';
import {
  checkmarkCircle,
  chevronBack,
  chevronForward,
  cameraOutline,
  documentTextOutline,
  personOutline,
  cardOutline,
  phonePortraitOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import './RegisterAFAPage.css';

const registrationSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits (Ghana format)'),
  email: z.string().email('Invalid email address'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  occupation: z.string().min(1, 'Occupation is required'),
  address: z.string().min(1, 'Address is required'),
  region: z.string().min(1, 'Region is required'),
  district: z.string().min(1, 'District is required'),
  gpsAddress: z.string().min(1, 'GPS address is required'),
  idNumber: z.string().min(1, 'ID number is required'),
  network: z.string().min(1, 'Network is required'),
  simNumber: z.string().min(1, 'SIM number is required'),
  puk: z.string().optional(),
  existingNumber: z.string().optional(),
  newNumber: z.string().optional(),
});

type FormData = z.infer<typeof registrationSchema>;

const step1Fields: (keyof FormData)[] = [
  'fullName', 'phone', 'email', 'dateOfBirth', 'gender',
  'occupation', 'address', 'region', 'district', 'gpsAddress',
];

const step2Fields: (keyof FormData)[] = ['idNumber'];
const step3Fields: (keyof FormData)[] = ['network', 'simNumber', 'puk', 'existingNumber', 'newNumber'];

const regions = [
  'Ashanti', 'Greater Accra', 'Eastern', 'Western', 'Central',
  'Volta', 'Northern', 'Upper East', 'Upper West', 'Brong Ahafo',
  'Western North', 'Oti', 'Bono East', 'Ahafo', 'Savannah', 'North East',
];

const networks = ['MTN', 'Vodafone', 'AirtelTigo', 'Glo'];

const steps = [
  { icon: personOutline, title: 'Customer Information', subtitle: 'Personal details' },
  { icon: cardOutline, title: 'Ghana Card', subtitle: 'ID verification' },
  { icon: phonePortraitOutline, title: 'SIM Information', subtitle: 'Network details' },
  { icon: documentTextOutline, title: 'Review & Submit', subtitle: 'Confirm your information' },
];

const RegisterAFAPage: React.FC = () => {
  const { user } = useAuthStore();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [loading, setLoading] = useState(false);
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState('');
  const [backPreview, setBackPreview] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', color: '' as 'success' | 'danger' | '' });
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);

  const { control, handleSubmit, trigger, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      fullName: '', phone: '', email: '', dateOfBirth: '', gender: '',
      occupation: '', address: '', region: '', district: '', gpsAddress: '',
      idNumber: '', network: '', simNumber: '', puk: '', existingNumber: '', newNumber: '',
    },
  });

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      if (backPreview) URL.revokeObjectURL(backPreview);
    };
  }, [frontPreview, backPreview]);

  const handleFrontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontImage(file);
      setFrontPreview(URL.createObjectURL(file));
    }
  };

  const handleBackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (backPreview) URL.revokeObjectURL(backPreview);
      setBackImage(file);
      setBackPreview(URL.createObjectURL(file));
    }
  };

  const getStepFields = (): (keyof FormData)[] => {
    if (step === 1) return step1Fields;
    if (step === 2) return step2Fields;
    if (step === 3) return step3Fields;
    return [];
  };

  const nextStep = async () => {
    if (step === 1) {
      const valid = await trigger(step1Fields);
      if (!valid) return;
    } else if (step === 2) {
      const valid = await trigger(step2Fields);
      if (!valid) return;
      if (!frontImage || !backImage) {
        setToast({ show: true, message: 'Please upload both front and back images of your Ghana Card', color: 'danger' });
        return;
      }
    } else if (step === 3) {
      const valid = await trigger(step3Fields);
      if (!valid) return;
    }
    setDirection(1);
    setStep((s) => Math.min(s + 1, 4));
  };

  const prevStep = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(path);
    return urlData.publicUrl;
  };

  const onSubmit = async (data: FormData) => {
    if (!confirmed) {
      setToast({ show: true, message: 'Please confirm the information before submitting', color: 'danger' });
      return;
    }
    if (!frontImage || !backImage) {
      setToast({ show: true, message: 'Please upload both Ghana card images', color: 'danger' });
      return;
    }

    setLoading(true);
    try {
      const timestamp = Date.now();
      const frontPath = `${user!.id}/${timestamp}-front.${frontImage.name.split('.').pop()}`;
      const backPath = `${user!.id}/${timestamp}-back.${backImage.name.split('.').pop()}`;

      const [frontUrl, backUrl] = await Promise.all([
        uploadFile(frontImage, frontPath),
        uploadFile(backImage, backPath),
      ]);

      const { data: regData, error: regError } = await supabase
        .from('registrations')
        .insert({
          user_id: user!.id,
          full_name: data.fullName,
          phone: data.phone,
          email: data.email,
          date_of_birth: data.dateOfBirth,
          gender: data.gender,
          occupation: data.occupation,
          address: data.address,
          region: data.region,
          district: data.district,
          gps_address: data.gpsAddress,
          id_number: data.idNumber,
          network: data.network,
          sim_number: data.simNumber,
          puk: data.puk || null,
          existing_number: data.existingNumber || null,
          new_number: data.newNumber || null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (regError) throw regError;

      const docErrors: any[] = [];
      const docsToInsert = [];

      if (frontUrl) {
        docsToInsert.push({
          registration_id: regData.id,
          user_id: user!.id,
          document_type: 'ghana_card_front',
          file_url: frontUrl,
          file_name: frontImage.name,
        });
      }
      if (backUrl) {
        docsToInsert.push({
          registration_id: regData.id,
          user_id: user!.id,
          document_type: 'ghana_card_back',
          file_url: backUrl,
          file_name: backImage.name,
        });
      }

      if (docsToInsert.length > 0) {
        const { error: docError } = await supabase
          .from('registration_documents')
          .insert(docsToInsert);
        if (docError) docErrors.push(docError);
      }

      const { error: timelineError } = await supabase
        .from('registration_timeline')
        .insert({
          registration_id: regData.id,
          user_id: user!.id,
          status: 'pending',
          note: 'Registration submitted successfully',
        });

      if (timelineError) docErrors.push(timelineError);

      if (docErrors.length > 0) {
        console.error('Non-fatal document/timeline errors:', docErrors);
      }

      setSubmitted(true);
      setToast({ show: true, message: 'Registration submitted successfully!', color: 'success' });

      setTimeout(() => {
        window.location.href = '/orders';
      }, 2000);
    } catch (err: any) {
      setToast({ show: true, message: err.message || 'Submission failed. Please try again.', color: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  const renderFieldError = (fieldName: keyof FormData) => {
    const msg = errors[fieldName]?.message;
    return msg ? <span className="field-error">{msg}</span> : null;
  };

  const renderInput = (
    name: keyof FormData,
    label: string,
    type: string = 'text',
    placeholder: string = ''
  ) => (
    <div className="input-group">
      <IonLabel className="input-label">{label}</IonLabel>
      <IonItem className={`input-item ${errors[name] ? 'input-error' : ''}`} lines="none">
        <Controller
          name={name}
          control={control}
          render={({ field }) => (
            <IonInput
              type={type as any}
              value={field.value}
              onIonInput={(e) => field.onChange(e.detail.value)}
              placeholder={placeholder}
            />
          )}
        />
      </IonItem>
      {renderFieldError(name)}
    </div>
  );

  const renderStep1 = () => (
    <div className="form-step">
      <div className="form-row">
        {renderInput('fullName', 'Full Name', 'text', 'John Doe')}
        {renderInput('phone', 'Phone Number', 'tel', '0241234567')}
      </div>
      <div className="form-row">
        {renderInput('email', 'Email Address', 'email', 'you@example.com')}
        {renderInput('dateOfBirth', 'Date of Birth', 'date')}
      </div>
      <div className="form-row">
        <div className="input-group">
          <IonLabel className="input-label">Gender</IonLabel>
          <IonItem className={`input-item ${errors.gender ? 'input-error' : ''}`} lines="none">
            <Controller
              name="gender"
              control={control}
              render={({ field }) => (
                <IonSelect
                  value={field.value}
                  onIonChange={(e) => field.onChange(e.detail.value)}
                  placeholder="Select Gender"
                >
                  <IonSelectOption value="Male">Male</IonSelectOption>
                  <IonSelectOption value="Female">Female</IonSelectOption>
                  <IonSelectOption value="Other">Other</IonSelectOption>
                </IonSelect>
              )}
            />
          </IonItem>
          {renderFieldError('gender')}
        </div>
        {renderInput('occupation', 'Occupation', 'text', 'e.g. Teacher')}
      </div>
      <div className="input-group">
        <IonLabel className="input-label">Address</IonLabel>
        <IonItem className={`input-item ${errors.address ? 'input-error' : ''}`} lines="none">
          <Controller
            name="address"
            control={control}
            render={({ field }) => (
              <IonTextarea
                value={field.value}
                onIonInput={(e) => field.onChange(e.detail.value)}
                placeholder="Enter your full address"
                rows={3}
              />
            )}
          />
        </IonItem>
        {renderFieldError('address')}
      </div>
      <div className="form-row">
        <div className="input-group">
          <IonLabel className="input-label">Region</IonLabel>
          <IonItem className={`input-item ${errors.region ? 'input-error' : ''}`} lines="none">
            <Controller
              name="region"
              control={control}
              render={({ field }) => (
                <IonSelect
                  value={field.value}
                  onIonChange={(e) => field.onChange(e.detail.value)}
                  placeholder="Select Region"
                >
                  {regions.map((r) => (
                    <IonSelectOption key={r} value={r}>{r}</IonSelectOption>
                  ))}
                </IonSelect>
              )}
            />
          </IonItem>
          {renderFieldError('region')}
        </div>
        {renderInput('district', 'District', 'text', 'e.g. Kumasi Metro')}
      </div>
      {renderInput('gpsAddress', 'GPS Address', 'text', 'e.g. AK-123-4567')}
    </div>
  );

  const renderStep2 = () => (
    <div className="form-step">
      {renderInput('idNumber', 'Ghana Card ID Number', 'text', 'GHA-XXXXXXXXXXXXX')}
      <div className="image-upload-row">
        <div className="image-upload-group">
          <IonLabel className="input-label">Front of Card</IonLabel>
          <input
            ref={frontInputRef}
            type="file"
            accept="image/*"
            onChange={handleFrontUpload}
            className="hidden-input"
          />
          <div
            className={`image-upload-box ${frontPreview ? 'has-image' : ''}`}
            onClick={() => frontInputRef.current?.click()}
          >
            {frontPreview ? (
              <div className="image-preview-wrapper">
                <img src={frontPreview} alt="Front of card" className="image-preview" />
                <div className="image-overlay">
                  <IonIcon icon={cameraOutline} />
                  <span>Change</span>
                </div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <IonIcon icon={cameraOutline} />
                <span>Upload Front</span>
              </div>
            )}
          </div>
        </div>
        <div className="image-upload-group">
          <IonLabel className="input-label">Back of Card</IonLabel>
          <input
            ref={backInputRef}
            type="file"
            accept="image/*"
            onChange={handleBackUpload}
            className="hidden-input"
          />
          <div
            className={`image-upload-box ${backPreview ? 'has-image' : ''}`}
            onClick={() => backInputRef.current?.click()}
          >
            {backPreview ? (
              <div className="image-preview-wrapper">
                <img src={backPreview} alt="Back of card" className="image-preview" />
                <div className="image-overlay">
                  <IonIcon icon={cameraOutline} />
                  <span>Change</span>
                </div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <IonIcon icon={cameraOutline} />
                <span>Upload Back</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="form-step">
      <div className="input-group">
        <IonLabel className="input-label">Network</IonLabel>
        <IonItem className={`input-item ${errors.network ? 'input-error' : ''}`} lines="none">
          <Controller
            name="network"
            control={control}
            render={({ field }) => (
              <IonSelect
                value={field.value}
                onIonChange={(e) => field.onChange(e.detail.value)}
                placeholder="Select Network"
              >
                {networks.map((n) => (
                  <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                ))}
              </IonSelect>
            )}
          />
        </IonItem>
        {renderFieldError('network')}
      </div>
      {renderInput('simNumber', 'SIM Number', 'tel', '0241234567')}
      <div className="form-row">
        {renderInput('puk', 'PUK Code', 'text', 'Optional')}
        {renderInput('existingNumber', 'Existing Number', 'tel', 'Optional')}
      </div>
      {renderInput('newNumber', 'New Number', 'tel', 'Optional')}
    </div>
  );

  const renderReviewItem = (label: string, value: string | undefined) => (
    <div className="review-item">
      <span className="review-label">{label}</span>
      <span className="review-value">{value || '—'}</span>
    </div>
  );

  const renderStep4 = () => {
    const data = getValues();
    return (
      <div className="form-step">
        <div className="review-section">
          <h3 className="review-section-title">
            <IonIcon icon={personOutline} />
            Customer Information
          </h3>
          {renderReviewItem('Full Name', data.fullName)}
          {renderReviewItem('Phone', data.phone)}
          {renderReviewItem('Email', data.email)}
          {renderReviewItem('Date of Birth', data.dateOfBirth)}
          {renderReviewItem('Gender', data.gender)}
          {renderReviewItem('Occupation', data.occupation)}
          {renderReviewItem('Address', data.address)}
          {renderReviewItem('Region', data.region)}
          {renderReviewItem('District', data.district)}
          {renderReviewItem('GPS Address', data.gpsAddress)}
        </div>
        <div className="review-section">
          <h3 className="review-section-title">
            <IonIcon icon={cardOutline} />
            Ghana Card
          </h3>
          {renderReviewItem('ID Number', data.idNumber)}
          <div className="review-item">
            <span className="review-label">Front Image</span>
            <span className="review-value">{frontImage ? frontImage.name : '—'}</span>
          </div>
          <div className="review-item">
            <span className="review-label">Back Image</span>
            <span className="review-value">{backImage ? backImage.name : '—'}</span>
          </div>
        </div>
        <div className="review-section">
          <h3 className="review-section-title">
            <IonIcon icon={phonePortraitOutline} />
            SIM Information
          </h3>
          {renderReviewItem('Network', data.network)}
          {renderReviewItem('SIM Number', data.simNumber)}
          {renderReviewItem('PUK', data.puk)}
          {renderReviewItem('Existing Number', data.existingNumber)}
          {renderReviewItem('New Number', data.newNumber)}
        </div>
        <div className="confirmation-group">
          <label className="confirmation-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="checkmark" />
            <span className="confirmation-text">
              I confirm that all the information provided above is accurate and complete
            </span>
          </label>
        </div>
      </div>
    );
  };

  if (submitted) {
    return (
      <IonPage>
      <DashboardLayout>
        <div className="register-afa-page">
          <motion.div
            className="submission-success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <IonIcon icon={checkmarkCircle} className="success-icon" />
            <h2>Registration Submitted!</h2>
            <p>Your AFA registration has been submitted successfully. Redirecting to orders...</p>
          </motion.div>
        </div>
      </DashboardLayout>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <DashboardLayout>
        <div className="register-afa-page">
            <div className="progress-indicator">
              {[1, 2, 3, 4].map((s) => (
                <React.Fragment key={s}>
                  <div className={`progress-circle ${s <= step ? 'active' : ''}`}>
                    {s < step ? (
                      <IonIcon icon={checkmarkCircle} />
                    ) : (
                      <span>{s}</span>
                    )}
                  </div>
                  {s < 4 && <div className={`progress-line ${s < step ? 'filled' : ''}`} />}
                </React.Fragment>
              ))}
            </div>
            <div className="step-labels">
              {steps.map((s, i) => (
                <span key={i} className={`step-label ${i + 1 === step ? 'current' : ''} ${i + 1 < step ? 'done' : ''}`}>
                  {s.title}
                </span>
              ))}
            </div>

            <div className="step-header">
              <div className="step-header-icon">
                <IonIcon icon={steps[step - 1].icon} />
              </div>
              <h2 className="step-title">{steps[step - 1].title}</h2>
              <p className="step-subtitle">{steps[step - 1].subtitle}</p>
            </div>

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                className="step-content"
              >
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
                {step === 4 && renderStep4()}
              </motion.div>
            </AnimatePresence>

            <div className="nav-buttons">
              {step > 1 && (
                <IonButton fill="outline" className="back-btn" onClick={prevStep}>
                  <IonIcon icon={chevronBack} slot="start" />
                  Back
                </IonButton>
              )}
              <div className="nav-spacer" />
              {step < 4 ? (
                <IonButton className="next-btn" onClick={nextStep}>
                  Next
                  <IonIcon icon={chevronForward} slot="end" />
                </IonButton>
              ) : (
                <IonButton
                  className="submit-btn"
                  onClick={handleSubmit(onSubmit)}
                  disabled={loading || !confirmed}
                >
                  {loading ? 'Submitting...' : 'Submit Registration'}
                </IonButton>
              )}
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
