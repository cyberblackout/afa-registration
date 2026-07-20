import React, { useState } from 'react';
import {
  IonContent,
  IonPage,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonCard,
  IonCardContent,
  IonToast,
} from '@ionic/react';
import {
  pricetagOutline,
  saveOutline,
  checkmarkCircle,
  cashOutline,
  cardOutline,
  trailSignOutline,
  flashOutline,
  diamondOutline,
  phonePortraitOutline,
  bicycleOutline,
  trendingUpOutline,
  walletOutline,
  ribbonOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import AdminLayout from '../../layouts/AdminLayout';
import './PricingPage.css';

const iconMap: Record<string, string> = {
  checkmarkCircle, flash: flashOutline, diamond: diamondOutline,
  phonePortrait: phonePortraitOutline, bicycle: bicycleOutline,
  trendingUp: trendingUpOutline, cash: cashOutline, wallet: walletOutline,
};

const PricingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [localAgentValues, setLocalAgentValues] = useState<Record<string, string>>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'warning'>('success');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [agentFee, setAgentFee] = useState('100');

  const { data: pricing = [], isLoading } = useQuery({
    queryKey: ['admin_pricing'],
    queryFn: async () => {
      const r = await supabase.from('pricing').select('*').eq('active', true);
      return r.data || [];
    },
  });

  React.useEffect(() => {
    if (pricing.length > 0 && Object.keys(localValues).length === 0) {
      const vals: Record<string, string> = {};
      const agentVals: Record<string, string> = {};
      pricing.forEach((p: any) => {
        vals[p.id] = (p.normal_price || p.amount)?.toString() || '0';
        agentVals[p.id] = p.agent_price?.toString() || '';
      });
      setLocalValues(vals);
      setLocalAgentValues(agentVals);
    }
  }, [pricing]);

  const updateValue = (id: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [id]: value }));
  };

  const updateAgentValue = (id: string, value: string) => {
    setLocalAgentValues(prev => ({ ...prev, [id]: value }));
  };

  const saveItem = async (item: any) => {
    const value = localValues[item.id];
    const agentValue = localAgentValues[item.id];
    const numVal = parseFloat(value);
    const agentNumVal = agentValue ? parseFloat(agentValue) : null;
    if (isNaN(numVal) || numVal < 0) {
      setToastMessage(`Invalid normal price for ${item.label || item.name}`);
      setToastColor('warning');
      setShowToast(true);
      return;
    }
    if (agentNumVal !== null && (isNaN(agentNumVal) || agentNumVal < 0)) {
      setToastMessage(`Invalid agent price for ${item.label || item.name}`);
      setToastColor('warning');
      setShowToast(true);
      return;
    }
    setSavingId(item.id);
    try {
      const updateData: any = { amount: numVal, normal_price: numVal };
      if (agentNumVal !== null) updateData.agent_price = agentNumVal;
      await supabase.from('pricing').update(updateData).eq('id', item.id);
      queryClient.invalidateQueries({ queryKey: ['admin_pricing'] });
      setToastMessage(`${item.label || item.name} updated`);
      setToastColor('success');
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Save failed');
      setToastColor('warning');
      setShowToast(true);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-pricing-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={pricetagOutline} className="page-icon" />
            <h1>Pricing Management</h1>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="empty-state">
            <p>Loading pricing...</p>
          </div>
        ) : (
          <div className="pricing-grid">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="agent-fee-section">
              <span className="fee-label"><IonIcon icon={ribbonOutline} /> Agent Registration Fee</span>
              <div className="fee-input-group">
                <span className="pricing-currency-symbol">GHS</span>
                <input
                  type="number"
                  className="fee-input"
                  value={agentFee}
                  onChange={(e) => setAgentFee(e.target.value)}
                  min="0"
                />
              </div>
              <IonButton
                size="small"
                className="pricing-save-btn"
                onClick={async () => {
                  const numVal = parseFloat(agentFee);
                  if (isNaN(numVal) || numVal < 0) return;
                  await supabase.from('app_settings').upsert({ key: 'agent_fee', value: numVal.toString(), category: 'agent' }, { onConflict: 'key' });
                  setToastMessage('Agent fee updated to GHS ' + numVal);
                  setToastColor('success');
                  setShowToast(true);
                }}
              >
                <IonIcon icon={saveOutline} slot="start" />
                Save
              </IonButton>
            </motion.div>
            {pricing.map((item: any, index: number) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <IonCard className="pricing-card">
                  <IonCardContent>
                    <div className="pricing-card-header">
                      <div className="pricing-icon-wrapper">
                        <IonIcon icon={iconMap[item.icon] || checkmarkCircle} className="pricing-card-icon" />
                      </div>
                      <span className="pricing-card-label">{item.label || item.name}</span>
                    </div>
                    <div className="pricing-input-row">
                      <div className="pricing-input-group">
                        <label className="pricing-input-label">Normal Price</label>
                        <div className="pricing-input-wrapper">
                          <span className="pricing-currency-symbol">{item.suffix || 'GH₵'}</span>
                          <input
                            type="number"
                            className="pricing-input"
                            value={localValues[item.id] || ''}
                            onChange={(e) => updateValue(item.id, e.target.value)}
                            step="0.1"
                            min="0"
                          />
                        </div>
                      </div>
                      <div className="pricing-input-group">
                        <label className="pricing-input-label agent-label">Agent Price</label>
                        <div className="pricing-input-wrapper">
                          <span className="pricing-currency-symbol">{item.suffix || 'GH₵'}</span>
                          <input
                            type="number"
                            className="pricing-input agent-input"
                            value={localAgentValues[item.id] || ''}
                            onChange={(e) => updateAgentValue(item.id, e.target.value)}
                            step="0.1"
                            min="0"
                            placeholder="Auto (80%)"
                          />
                        </div>
                      </div>
                    </div>
                    <IonButton expand="block" className="pricing-save-btn" onClick={() => saveItem(item)} disabled={savingId === item.id}>
                      <IonIcon icon={saveOutline} slot="start" />
                      {savingId === item.id ? 'Saving...' : 'Save'}
                    </IonButton>
                  </IonCardContent>
                </IonCard>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <IonToast
        isOpen={showToast}
        onDidDismiss={() => setShowToast(false)}
        message={toastMessage}
        duration={3000}
        position="top"
        color={toastColor}
      />
    </AdminLayout>
  );
};

export default PricingPage;
