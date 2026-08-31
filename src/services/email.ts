import { supabase } from './supabase';

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  type: 'transactional' | 'marketing' = 'transactional'
) {
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, html, type },
    });
    if (error) console.error('Email send failed:', error);
    return { error };
  } catch (err: any) {
    console.error('Email send error:', err);
    return { error: err };
  }
}

export function topUpEmailHtml(name: string, amount: number, balance: number, date: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#FFCB05;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px">MTN AFA Portal</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px">
            <h2 style="color:#1a1a2e;margin:0 0 6px;font-size:20px;font-weight:600">Wallet Top-Up Confirmed</h2>
            <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.5">Hi <strong style="color:#1a1a2e">${escapeHtml(name)}</strong>,</p>
            <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.5">Your MTN AFA wallet has been successfully credited.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;padding:20px;margin:0 0 20px">
              <tr><td style="padding:0 0 4px;color:#6b7280;font-size:13px">Amount Credited</td></tr>
              <tr><td style="padding:0 0 16px;color:#059669;font-size:26px;font-weight:800">GH₵ ${Number(amount ?? 0).toFixed(2)}</td></tr>
              <tr><td style="padding:0 0 4px;color:#6b7280;font-size:13px">New Wallet Balance</td></tr>
              <tr><td style="padding:0;color:#1a1a2e;font-size:18px;font-weight:700">GH₵ ${Number(balance ?? 0).toFixed(2)}</td></tr>
            </table>
            <p style="color:#9ca3af;margin:0 0 4px;font-size:12px">Transaction date: ${date}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#9ca3af;margin:0;font-size:11px;text-align:center">MTN AFA Registration Portal &middot; <a href="#" style="color:#9ca3af;text-decoration:underline">Support</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function registrationStatusHtml(name: string, registrationId: string, status: string, notes?: string): string {
  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    processing: '#2563eb',
    document_verification: '#8b5cf6',
    approved: '#059669',
    completed: '#059669',
    rejected: '#dc2626',
    cancelled: '#6b7280',
  };
  const statusLabels: Record<string, string> = {
    pending: 'Pending Review',
    processing: 'Under Processing',
    document_verification: 'Document Verification',
    approved: 'Approved',
    completed: 'Completed',
    rejected: 'Not Approved',
    cancelled: 'Cancelled',
  };
  const color = statusColors[status] || '#6b7280';
  const label = statusLabels[status] || status;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#FFCB05;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px">MTN AFA Portal</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px">
            <h2 style="color:#1a1a2e;margin:0 0 6px;font-size:20px;font-weight:600">Registration Status Update</h2>
            <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.5">Hi <strong style="color:#1a1a2e">${escapeHtml(name)}</strong>,</p>
            <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.5">Your AFA registration <strong style="color:#1a1a2e">#${registrationId}</strong> has been updated.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;padding:20px;margin:0 0 20px;text-align:center">
              <tr><td style="padding:0 0 8px;color:#6b7280;font-size:13px">Current Status</td></tr>
              <tr><td style="padding:0"><span style="display:inline-block;background:${color}15;color:${color};padding:6px 20px;border-radius:20px;font-weight:700;font-size:14px">${label}</span></td></tr>
            </table>
            ${notes ? `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.5"><strong>Note:</strong> ${escapeHtml(notes)}</p>` : ''}
            <p style="color:#9ca3af;margin:0 0 4px;font-size:12px">Reference: ${registrationId}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#9ca3af;margin:0;font-size:11px;text-align:center">MTN AFA Registration Portal &middot; <a href="#" style="color:#9ca3af;text-decoration:underline">Support</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function marketingEmailHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#FFCB05;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px">MTN AFA Portal</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px">
            <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:20px;font-weight:600">${escapeHtml(title)}</h2>
            <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#9ca3af;margin:0;font-size:11px;text-align:center">You received this email because you opted in for marketing communications.<br><a href="#" style="color:#9ca3af;text-decoration:underline">Unsubscribe from marketing emails</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
