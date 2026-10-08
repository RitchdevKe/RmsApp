
import { Message } from '../types';
import { supabase } from './supabaseClient';

/**
 * Communication Service API
 * Simulates interaction with external providers like Twilio, Africa's Talking, SendGrid, WhatsApp Business API.
 */

// Simulate network latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    providerRef?: string;
}

export const communicationApi = {
    // --- PUSH APIS (Sending) ---

    /**
     * Send SMS via Gateway (e.g. Africa's Talking, Twilio, OnfonMedia)
     * Respects the bulkSmsEnabled flag stored in systemSettings.
     */
    sendSMS: async (to: string, content: string, senderId: string, bulkSmsEnabled?: boolean): Promise<SendResult> => {
        if (bulkSmsEnabled === false) {
            return { success: false, error: 'Bulk SMS not integrated. Kindly ask the super-admin to integrate.' };
        }
        console.log(`[API Push] Sending SMS... To: ${to}, SenderID: ${senderId}`);
        try {
            const { data, error } = await supabase.functions.invoke('send-sms', {
                body: { to, content, senderId },
            });
            if (error) throw error;
            const messageId = (data as any)?.messageId || `sms-${Date.now()}`;
            return { success: true, messageId, providerRef: (data as any)?.providerRef };
        } catch (e: any) {
            const errMsg = e?.message || 'SMS dispatch failed';
            console.error('[communicationApi.sendSMS] Error:', errMsg);
            return { success: false, error: errMsg };
        }
    },

    /**
     * Send Email via SMTP/API (e.g. SendGrid, Mailgun)
     */
    sendEmail: async (to: string, subject: string, body: string, from: string): Promise<SendResult> => {
        console.log(`[API Push] Sending Email... To: ${to}, From: ${from}`);
        try {
            const { data, error } = await supabase.functions.invoke('send-email', {
                body: { to, subject, html: body },
            });
            if (error) throw error;
            return { 
                success: true, 
                messageId: (data as any)?.messageId || `email-${Date.now()}`,
                providerRef: (data as any)?.providerRef
            };
        } catch (e: any) {
            await delay(1200);
            if (!to.includes('@')) return { success: false, error: 'Invalid email address' };
            return { 
                success: true, 
                messageId: `email-${Date.now()}`,
                providerRef: `email-local-fallback`
            };
        }
    },

    /**
     * Send WhatsApp Message via Meta Cloud API (send-whatsapp Edge Function)
     */
    sendWhatsApp: async (to: string, content: string): Promise<SendResult> => {
        console.log(`[API Push] Sending WhatsApp... To: ${to}`);
        try {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
                body: { to, content },
            });
            if (error) throw error;
            if ((data as any)?.success === false) {
                // WhatsApp not yet configured — return informative non-blocking result
                return {
                    success: false,
                    error: (data as any)?.error || 'WhatsApp not configured',
                    messageId: `wa-pending-${Date.now()}`,
                };
            }
            return {
                success: true,
                messageId: (data as any)?.messageId || `wa-${Date.now()}`,
                providerRef: (data as any)?.providerRef,
            };
        } catch (e: any) {
            console.warn('[sendWhatsApp] Edge function error:', e.message);
            return { success: false, error: e.message || 'WhatsApp send failed' };
        }
    },

    /**
     * Send In-App Notification — stored in Supabase; delivery via Realtime subscription
     */
    sendInApp: async (userId: string, content: string): Promise<SendResult> => {
        console.log(`[API Push] Sending In-App message... User: ${userId}`);
        // Actual delivery is handled by Supabase Realtime (DataContext subscription).
        // This function records intent; the message is persisted by addMessage() in the caller.
        return {
            success: true,
            messageId: `inapp-${Date.now()}`,
            providerRef: `supabase-realtime`,
        };
    },

    // --- PULL APIS (Receiving/Syncing) ---

    /**
     * Fetch new messages from all channels (Sync)
     * Simulates polling external APIs for new inbound messages/replies
     */
    pullMessages: async (lastSyncTimestamp: number): Promise<Message[]> => {
        console.log(`[API Pull] Syncing messages since ${new Date(lastSyncTimestamp).toLocaleTimeString()}...`);
        await delay(1500);

        return [];
    },

    /**
     * Fetch Delivery Status Reports (DLRs)
     */
    pullDeliveryReports: async (messageIds: string[]): Promise<Record<string, string>> => {
        console.log(`[API Pull] Fetching DLRs for ${messageIds.length} messages...`);
        await delay(600);
        
        const updates: Record<string, string> = {};
        messageIds.forEach((id) => {
            updates[id] = 'Delivered';
        });
        return updates;
    }
};
