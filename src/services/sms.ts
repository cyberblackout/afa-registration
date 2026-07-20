import { supabase } from './supabase';

export async function sendSms(
  userId: string,
  phone: string,
  message: string,
  type: 'transactional' | 'marketing' = 'transactional'
) {
  try {
    const { error } = await supabase.functions.invoke('send-sms', {
      body: { user_id: userId, phone, message, type },
    });
    if (error) console.error('SMS send failed:', error);
    return { error };
  } catch (err: any) {
    console.error('SMS send error:', err);
    return { error: err };
  }
}
