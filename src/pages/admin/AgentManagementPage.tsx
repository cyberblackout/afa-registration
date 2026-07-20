import React, { useState } from 'react';
import { IonContent, IonPage, IonCard, IonCardContent, IonButton, IonIcon,
  IonText, IonToast, IonLoading, IonChip, IonSearchbar, IonSegment, IonSegmentButton,
  IonLabel, IonModal, IonItem, IonTextarea,
} from '@ionic/react';
import {
  peopleOutline, checkmarkCircleOutline, closeCircleOutline, timeOutline,
  shieldCheckmarkOutline, ribbonOutline, cashOutline, searchOutline,
  reloadOutline, eyeOutline, banOutline, checkmarkOutline, alertCircleOutline,
} from 'ionicons/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabase';
import AdminLayout from '../../layouts/AdminLayout';
import './AgentManagementPage.css';

const AgentManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('agents');
  const [toast, setToast] = useState({ show: false, message: '', color: 'success' });
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['admin_agents'],
    queryFn: async () => {
      const { data } = await supabase.rpc('admin_get_agents');
      return data as any || { agents: [] };
    },
  });

  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ['admin_agent_applications'],
    queryFn: async () => {
      const { data } = await supabase.rpc('admin_get_agent_applications');
      return data as any || { applications: [] };
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { data } = await supabase.rpc('approve_agent_application', {
        p_application_id: id,
        p_status: status,
        p_admin_notes: notes,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_agents'] });
      queryClient.invalidateQueries({ queryKey: ['admin_agent_applications'] });
      setLoading(false);
      setSelectedApp(null);
      setAdminNotes('');
    },
    onError: (err: any) => {
      setToast({ show: true, message: err.message, color: 'danger' });
      setLoading(false);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const { data } = await supabase.rpc('admin_toggle_agent_status', {
        p_user_id: userId,
        p_status: status,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_agents'] });
      setToast({ show: true, message: 'Agent status updated', color: 'success' });
    },
    onError: (err: any) => {
      setToast({ show: true, message: err.message, color: 'danger' });
    },
  });

  const handleApprove = (app: any) => {
    setSelectedApp(app);
  };

  const confirmApprove = () => {
    if (!selectedApp) return;
    setLoading(true);
    approveMutation.mutate({ id: selectedApp.id, status: 'approved', notes: adminNotes });
  };

  const handleReject = (app: any) => {
    setSelectedApp(app);
  };

  const confirmReject = () => {
    if (!selectedApp) return;
    setLoading(true);
    approveMutation.mutate({ id: selectedApp.id, status: 'rejected', notes: adminNotes });
  };

  const agents = agentsData?.agents || [];
  const applications = appsData?.applications || [];

  const filteredAgents = agents.filter((a: any) =>
    a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.agent_id?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase()) ||
    a.phone?.includes(search)
  );

  const pendingApps = applications.filter((a: any) => a.status === 'pending');
  const allFilteredApps = applications.filter((a: any) =>
    a.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.user_email?.toLowerCase().includes(search.toLowerCase()) ||
    a.user_phone?.includes(search)
  );

  return (
    <AdminLayout>
      <div className="agent-management-page">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="am-header">
          <div className="am-header-left">
            <IonIcon icon={ribbonOutline} className="am-header-icon" />
            <div>
              <h1>Agent Management</h1>
              <p>Manage agent applications, approvals, and agent accounts</p>
            </div>
          </div>
        </motion.div>

        <div className="am-stats-row">
          <div className="am-stat-card">
            <IonIcon icon={peopleOutline} style={{ color: '#4CAF50' }} />
            <div>
              <span className="am-stat-value">{agents.length}</span>
              <span className="am-stat-label">Total Agents</span>
            </div>
          </div>
          <div className="am-stat-card">
            <IonIcon icon={timeOutline} style={{ color: '#FF9800' }} />
            <div>
              <span className="am-stat-value">{pendingApps.length}</span>
              <span className="am-stat-label">Pending Applications</span>
            </div>
          </div>
          <div className="am-stat-card">
            <IonIcon icon={checkmarkCircleOutline} style={{ color: '#2e7d32' }} />
            <div>
              <span className="am-stat-value">{agents.filter((a: any) => a.agent_verified).length}</span>
              <span className="am-stat-label">Verified Agents</span>
            </div>
          </div>
          <div className="am-stat-card">
            <IonIcon icon={banOutline} style={{ color: '#c62828' }} />
            <div>
              <span className="am-stat-value">{agents.filter((a: any) => a.agent_status === 'suspended').length}</span>
              <span className="am-stat-label">Suspended</span>
            </div>
          </div>
        </div>

        <IonSearchbar
          value={search}
          onIonInput={(e) => setSearch(e.detail.value || '')}
          placeholder="Search by name, ID, email, or phone"
          className="am-search"
        />

        <IonSegment value={segment} onIonChange={(e) => setSegment(e.detail.value as string)} className="am-segment">
          <IonSegmentButton value="agents">
            <IonLabel>Agents ({agents.length})</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="applications">
            <IonLabel>Applications ({pendingApps.length} pending)</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        {segment === 'agents' && (
          <div className="am-table-wrapper">
            {filteredAgents.length === 0 ? (
              <div className="am-empty">
                <IonIcon icon={peopleOutline} />
                <p>{search ? 'No agents match your search' : 'No agents yet'}</p>
              </div>
            ) : (
              <table className="am-table">
                <thead>
                  <tr>
                    <th>Agent ID</th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Registrations</th>
                    <th>Earnings</th>
                    <th>Since</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent: any) => (
                    <tr key={agent.id}>
                      <td><code>{agent.agent_id || '—'}</code></td>
                      <td>{agent.full_name}</td>
                      <td>
                        <div>{agent.email}</div>
                        <div className="am-phone">{agent.phone}</div>
                      </td>
                      <td>
                        <span className={`agent-status-badge ${agent.agent_status}`}>
                          {agent.agent_status}
                        </span>
                        {agent.agent_verified && <span className="verified-badge-sm">✓ Verified</span>}
                      </td>
                      <td>{agent.registrations_count || 0}</td>
                      <td>GHS {Number(agent.earnings || 0).toFixed(2)}</td>
                      <td>{agent.agent_since ? new Date(agent.agent_since).toLocaleDateString() : '—'}</td>
                      <td>
                        <div className="am-actions">
                          {agent.agent_status === 'active' ? (
                            <button
                              className="am-action-btn suspend"
                              onClick={() => toggleStatusMutation.mutate({ userId: agent.id, status: 'suspended' })}
                              title="Suspend Agent"
                            >
                              <IonIcon icon={banOutline} />
                            </button>
                          ) : (
                            <button
                              className="am-action-btn activate"
                              onClick={() => toggleStatusMutation.mutate({ userId: agent.id, status: 'active' })}
                              title="Activate Agent"
                            >
                              <IonIcon icon={checkmarkOutline} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {segment === 'applications' && (
          <div className="am-table-wrapper">
            {allFilteredApps.length === 0 ? (
              <div className="am-empty">
                <IonIcon icon={timeOutline} />
                <p>No applications found</p>
              </div>
            ) : (
              <table className="am-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Amount Paid</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allFilteredApps.map((app: any) => (
                    <tr key={app.id}>
                      <td>{app.user_name}</td>
                      <td>{app.user_email}</td>
                      <td>{app.user_phone}</td>
                      <td>GHS {Number(app.amount_paid).toFixed(2)}</td>
                      <td>
                        <span className={`app-status-badge ${app.status}`}>
                          {app.status === 'pending' ? 'Pending' : app.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      </td>
                      <td>{new Date(app.created_at).toLocaleDateString()}</td>
                      <td>
                        {app.status === 'pending' && (
                          <div className="am-actions">
                            <button className="am-action-btn approve" onClick={() => handleApprove(app)} title="Approve">
                              <IonIcon icon={checkmarkCircleOutline} />
                            </button>
                            <button className="am-action-btn reject" onClick={() => handleReject(app)} title="Reject">
                              <IonIcon icon={closeCircleOutline} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <IonModal isOpen={!!selectedApp} onDidDismiss={() => { setSelectedApp(null); setAdminNotes(''); }}>
          <div className="am-modal">
            <h2>{selectedApp?.status === 'pending' ? 'Review Application' : 'Application Details'}</h2>
            {selectedApp && (
              <div className="am-modal-body">
                <div className="am-modal-info">
                  <div><strong>Name:</strong> {selectedApp.user_name}</div>
                  <div><strong>Email:</strong> {selectedApp.user_email}</div>
                  <div><strong>Phone:</strong> {selectedApp.user_phone}</div>
                  <div><strong>Amount Paid:</strong> GHS {Number(selectedApp.amount_paid).toFixed(2)}</div>
                  <div><strong>Applied:</strong> {new Date(selectedApp.created_at).toLocaleString()}</div>
                </div>
                <IonItem>
                  <IonTextarea
                    label="Admin Notes"
                    labelPlacement="stacked"
                    value={adminNotes}
                    onIonInput={(e) => setAdminNotes(e.detail.value || '')}
                    placeholder="Optional notes about this application"
                    rows={3}
                  />
                </IonItem>
                <div className="am-modal-actions">
                  <IonButton color="success" onClick={confirmApprove} disabled={loading}>
                    <IonIcon icon={checkmarkCircleOutline} slot="start" />
                    Approve
                  </IonButton>
                  <IonButton color="danger" onClick={confirmReject} disabled={loading}>
                    <IonIcon icon={closeCircleOutline} slot="start" />
                    Reject
                  </IonButton>
                  <IonButton fill="outline" onClick={() => { setSelectedApp(null); setAdminNotes(''); }}>
                    Cancel
                  </IonButton>
                </div>
              </div>
            )}
          </div>
        </IonModal>

        <IonLoading isOpen={loading} message="Processing..." />
        <IonToast
          isOpen={toast.show}
          message={toast.message}
          duration={3000}
          color={toast.color as any}
          onDidDismiss={() => setToast({ ...toast, show: false })}
        />
      </div>
    </AdminLayout>
  );
};

export default AgentManagementPage;
