import React, { useState } from 'react';
import {
  IonContent,
  IonPage,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonToast,
} from '@ionic/react';
import {
  barChartOutline,
  downloadOutline,
  trendingUpOutline,
  cashOutline,
  peopleOutline,
  cardOutline,
  documentTextOutline,
  walletOutline,
  calendarOutline,
  checkmarkCircle,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import AdminLayout from '../../layouts/AdminLayout';
import './ReportsPage.css';

type DateRange = 'Today' | 'This Week' | 'This Month' | 'This Year' | 'Custom';
type ReportType = 'Revenue' | 'Registration' | 'Payment' | 'User';

const dateRanges: DateRange[] = ['Today', 'This Week', 'This Month', 'This Year', 'Custom'];

const ReportsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>('This Month');
  const [activeReport, setActiveReport] = useState<ReportType>('Revenue');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const { data: revenueData } = useQuery({
    queryKey: ['report_revenue', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange(dateRange);
      const { data } = await supabase
        .from('wallet_transactions')
        .select('amount, type, created_at')
        .gte('created_at', start)
        .lte('created_at', end);
      const credits = (data || []).filter((t: any) => t.type === 'credit').reduce((s: number, t: any) => s + (t.amount || 0), 0);
      const total = (data || []).reduce((s: number, t: any) => s + (t.amount || 0), 0);
      return { credits, total, count: data?.length || 0 };
    },
  });

  const { data: registrationStats } = useQuery({
    queryKey: ['report_registrations', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange(dateRange);
      const all = await supabase.from('registrations').select('status').gte('created_at', start).lte('created_at', end);
      const total = all.data?.length || 0;
      const pending = (all.data || []).filter((r: any) => r.status === 'pending').length;
      const approved = (all.data || []).filter((r: any) => r.status === 'approved').length;
      const rejected = (all.data || []).filter((r: any) => r.status === 'rejected').length;
      return { total, pending, approved, rejected };
    },
  });

  const { data: paymentStats } = useQuery({
    queryKey: ['report_payments', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange(dateRange);
      const { data } = await supabase
        .from('wallet_transactions')
        .select('amount, payment_method, status, created_at')
        .gte('created_at', start)
        .lte('created_at', end);
      const total = (data || []).reduce((s: number, t: any) => s + (t.amount || 0), 0);
      const momo = (data || []).filter((t: any) => t.payment_method === 'mobile_money').reduce((s: number, t: any) => s + (t.amount || 0), 0);
      const card = (data || []).filter((t: any) => t.payment_method === 'card').reduce((s: number, t: any) => s + (t.amount || 0), 0);
      const bank = (data || []).filter((t: any) => t.payment_method === 'bank').reduce((s: number, t: any) => s + (t.amount || 0), 0);
      return { total, momo, card, bank, count: data?.length || 0 };
    },
  });

  const { data: userStats } = useQuery({
    queryKey: ['report_users', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange(dateRange);
      const newUsers = await supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end);
      const totalUsers = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      return { newUsers: newUsers.count ?? 0, totalUsers: totalUsers.count ?? 0 };
    },
  });

  const getDateRange = (range: DateRange): { start: string; end: string } => {
    const now = new Date();
    const end = now.toISOString();
    let start: Date;
    switch (range) {
      case 'Today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'This Week':
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case 'This Month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'This Year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'Custom':
        start = new Date(customStartDate || now);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start: start.toISOString(), end };
  };

  const handleDownload = (format: string) => {
    let csvContent = 'Metric,Value\n';
    if (activeReport === 'Revenue') {
      csvContent += `Total Revenue,GH₵ ${(revenueData?.credits || 0).toLocaleString()}\n`;
      csvContent += `Total Transactions,${(revenueData?.count || 0).toLocaleString()}\n`;
    } else if (activeReport === 'Registration') {
      csvContent += `Total Registrations,${(registrationStats?.total || 0).toLocaleString()}\n`;
      csvContent += `Pending,${(registrationStats?.pending || 0).toLocaleString()}\n`;
      csvContent += `Approved,${(registrationStats?.approved || 0).toLocaleString()}\n`;
      csvContent += `Rejected,${(registrationStats?.rejected || 0).toLocaleString()}\n`;
    } else if (activeReport === 'Payment') {
      csvContent += `Total Payments,GH₵ ${(paymentStats?.total || 0).toLocaleString()}\n`;
      csvContent += `Mobile Money,GH₵ ${(paymentStats?.momo || 0).toLocaleString()}\n`;
      csvContent += `Card Payments,GH₵ ${(paymentStats?.card || 0).toLocaleString()}\n`;
      csvContent += `Bank Transfers,GH₵ ${(paymentStats?.bank || 0).toLocaleString()}\n`;
      csvContent += `Transactions,${(paymentStats?.count || 0).toLocaleString()}\n`;
    } else if (activeReport === 'User') {
      csvContent += `New Users,${(userStats?.newUsers || 0).toLocaleString()}\n`;
      csvContent += `Total Users,${(userStats?.totalUsers || 0).toLocaleString()}\n`;
    }
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `${activeReport.toLowerCase()}-report-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToastMessage(`${activeReport} Report downloaded as ${format}`);
    setShowToast(true);
  };

  const statCards = [
    { label: 'Revenue', value: revenueData ? `GH₵ ${revenueData.credits.toLocaleString()}` : '...', icon: cashOutline, change: '' },
    { label: 'Registrations', value: registrationStats ? registrationStats.total.toLocaleString() : '...', icon: documentTextOutline, change: '' },
    { label: 'New Users', value: userStats ? userStats.newUsers.toLocaleString() : '...', icon: peopleOutline, change: '' },
    { label: 'Transactions', value: paymentStats ? paymentStats.count.toLocaleString() : '...', icon: walletOutline, change: '' },
  ];



  const reportIcons: Record<string, string> = {
    Revenue: trendingUpOutline,
    Registration: documentTextOutline,
    Payment: cardOutline,
    User: peopleOutline,
  };

  const renderReportData = () => {
    switch (activeReport) {
      case 'Revenue':
        return (
          <>
            <div className="report-row"><span className="rtd rtd-label">Total Revenue</span><span className="rtd rtd-value">GH₵ {(revenueData?.credits || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Total Transactions</span><span className="rtd rtd-value">{(revenueData?.count || 0).toLocaleString()}</span></div>
          </>
        );
      case 'Registration':
        return (
          <>
            <div className="report-row"><span className="rtd rtd-label">Total Registrations</span><span className="rtd rtd-value">{(registrationStats?.total || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Pending</span><span className="rtd rtd-value">{(registrationStats?.pending || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Approved</span><span className="rtd rtd-value">{(registrationStats?.approved || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Rejected</span><span className="rtd rtd-value">{(registrationStats?.rejected || 0).toLocaleString()}</span></div>
          </>
        );
      case 'Payment':
        return (
          <>
            <div className="report-row"><span className="rtd rtd-label">Total Payments</span><span className="rtd rtd-value">GH₵ {(paymentStats?.total || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Mobile Money</span><span className="rtd rtd-value">GH₵ {(paymentStats?.momo || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Card Payments</span><span className="rtd rtd-value">GH₵ {(paymentStats?.card || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Bank Transfers</span><span className="rtd rtd-value">GH₵ {(paymentStats?.bank || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Transactions</span><span className="rtd rtd-value">{(paymentStats?.count || 0).toLocaleString()}</span></div>
          </>
        );
      case 'User':
        return (
          <>
            <div className="report-row"><span className="rtd rtd-label">New Users</span><span className="rtd rtd-value">{(userStats?.newUsers || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Total Users</span><span className="rtd rtd-value">{(userStats?.totalUsers || 0).toLocaleString()}</span></div>
          </>
        );
      default:
        return null;
    }
  };

  const reportTypesList: ReportType[] = ['Revenue', 'Registration', 'Payment', 'User'];

  return (
    <AdminLayout>
      <div className="admin-reports-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={barChartOutline} className="page-icon" />
            <h1>Reports & Analytics</h1>
          </div>
        </motion.div>

        <div className="date-range-bar">
          {dateRanges.map(range => (
            <button
              key={range}
              className={`date-range-btn ${dateRange === range ? 'dr-active' : ''}`}
              onClick={() => setDateRange(range)}
            >
              {range === 'Custom' && <IonIcon icon={calendarOutline} />}
              {range}
            </button>
          ))}
          {dateRange === 'Custom' && (
            <div className="custom-date-inputs">
              <input type="date" className="date-input" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} />
              <span className="date-separator">to</span>
              <input type="date" className="date-input" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} />
            </div>
          )}
        </div>

        <div className="reports-stats">
          {statCards.map((stat, i) => (
            <motion.div key={stat.label} className="stat-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <div className="stat-card-left">
                <div className="stat-card-icon">
                  <IonIcon icon={stat.icon} />
                </div>
                <div className="stat-card-info">
                  <span className="stat-card-label">{stat.label}</span>
                  <span className="stat-card-value">{stat.value}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="reports-section">
          <div className="report-type-bar">
            {reportTypesList.map(type => (
              <button
                key={type}
                className={`report-type-btn ${activeReport === type ? 'rt-active' : ''}`}
                onClick={() => setActiveReport(type)}
              >
                <IonIcon icon={reportIcons[type]} />
                <span>{type} Report</span>
              </button>
            ))}
          </div>

          <motion.div key={activeReport} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="report-table-wrapper">
            <div className="report-table-header">
              <span className="rth rth-label">Metric</span>
              <span className="rth rth-value">Value</span>
            </div>
            {renderReportData()}
          </motion.div>

          <div className="download-bar">
            <span className="download-label">Download Report</span>
            <div className="download-buttons">
              <button className="download-btn pdf-btn" onClick={() => handleDownload('PDF')}>
                <IonIcon icon={downloadOutline} />
                <span>PDF</span>
              </button>
              <button className="download-btn excel-btn" onClick={() => handleDownload('Excel')}>
                <IonIcon icon={downloadOutline} />
                <span>Excel</span>
              </button>
              <button className="download-btn csv-btn" onClick={() => handleDownload('CSV')}>
                <IonIcon icon={downloadOutline} />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <IonToast isOpen={showToast} onDidDismiss={() => setShowToast(false)} message={toastMessage} duration={3000} position="top" color="success" />
    </AdminLayout>
  );
};

export default ReportsPage;
