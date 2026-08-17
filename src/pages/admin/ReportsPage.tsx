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
import { adminReportsApi } from '../../services/api';
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

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange(dateRange);
      return adminReportsApi.get(start, end) as any;
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
      csvContent += `Total Revenue,GH₵ ${(report?.revenue?.credits || 0).toLocaleString()}\n`;
      csvContent += `Total Transactions,${(report?.revenue?.count || 0).toLocaleString()}\n`;
    } else if (activeReport === 'Registration') {
      csvContent += `Total Registrations,${(report?.registration_stats?.total || 0).toLocaleString()}\n`;
      csvContent += `Pending,${(report?.registration_stats?.pending || 0).toLocaleString()}\n`;
      csvContent += `Approved,${(report?.registration_stats?.approved || 0).toLocaleString()}\n`;
      csvContent += `Rejected,${(report?.registration_stats?.rejected || 0).toLocaleString()}\n`;
    } else if (activeReport === 'Payment') {
      csvContent += `Total Payments,GH₵ ${(report?.payment_stats?.total || 0).toLocaleString()}\n`;
      csvContent += `Mobile Money,GH₵ ${(report?.payment_stats?.momo || 0).toLocaleString()}\n`;
      csvContent += `Card Payments,GH₵ ${(report?.payment_stats?.card || 0).toLocaleString()}\n`;
      csvContent += `Bank Transfers,GH₵ ${(report?.payment_stats?.bank || 0).toLocaleString()}\n`;
      csvContent += `Transactions,${(report?.payment_stats?.count || 0).toLocaleString()}\n`;
    } else if (activeReport === 'User') {
      csvContent += `New Users,${(report?.new_users || 0).toLocaleString()}\n`;
      csvContent += `Total Users,${(report?.total_users || 0).toLocaleString()}\n`;
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
    { label: 'Revenue', value: report ? `GH₵ ${report.revenue.credits.toLocaleString()}` : '...', icon: cashOutline, change: '' },
    { label: 'Registrations', value: report ? report.registration_stats.total.toLocaleString() : '...', icon: documentTextOutline, change: '' },
    { label: 'New Users', value: report ? report.new_users.toLocaleString() : '...', icon: peopleOutline, change: '' },
    { label: 'Transactions', value: report ? report.payment_stats.count.toLocaleString() : '...', icon: walletOutline, change: '' },
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
            <div className="report-row"><span className="rtd rtd-label">Total Revenue</span><span className="rtd rtd-value">GH₵ {(report?.revenue?.credits || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Total Transactions</span><span className="rtd rtd-value">{(report?.revenue?.count || 0).toLocaleString()}</span></div>
          </>
        );
      case 'Registration':
        return (
          <>
            <div className="report-row"><span className="rtd rtd-label">Total Registrations</span><span className="rtd rtd-value">{(report?.registration_stats?.total || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Pending</span><span className="rtd rtd-value">{(report?.registration_stats?.pending || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Approved</span><span className="rtd rtd-value">{(report?.registration_stats?.approved || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Rejected</span><span className="rtd rtd-value">{(report?.registration_stats?.rejected || 0).toLocaleString()}</span></div>
          </>
        );
      case 'Payment':
        return (
          <>
            <div className="report-row"><span className="rtd rtd-label">Total Payments</span><span className="rtd rtd-value">GH₵ {(report?.payment_stats?.total || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Mobile Money</span><span className="rtd rtd-value">GH₵ {(report?.payment_stats?.momo || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Card Payments</span><span className="rtd rtd-value">GH₵ {(report?.payment_stats?.card || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Bank Transfers</span><span className="rtd rtd-value">GH₵ {(report?.payment_stats?.bank || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Transactions</span><span className="rtd rtd-value">{(report?.payment_stats?.count || 0).toLocaleString()}</span></div>
          </>
        );
      case 'User':
        return (
          <>
            <div className="report-row"><span className="rtd rtd-label">New Users</span><span className="rtd rtd-value">{(report?.new_users || 0).toLocaleString()}</span></div>
            <div className="report-row"><span className="rtd rtd-label">Total Users</span><span className="rtd rtd-value">{(report?.total_users || 0).toLocaleString()}</span></div>
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
