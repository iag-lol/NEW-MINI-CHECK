import { supabase } from '../../../shared/lib/supabaseClient';
import { SrlRequest, SrlRequestBus, SrlEmailSetting, SrlFilters, SrlStatus, SrlBusImage } from '../types';
import { emailService } from '../../../shared/services/emailService';
import { EmailPayload } from '../../../shared/types/email';

// ==========================================
// REQUESTS
// ==========================================

export async function fetchSrlRequests(filters?: SrlFilters) {
    let query = supabase
        .from('srl_requests')
        .select(`
            *,
            srl_request_buses (
                id, bus_ppu, bus_model, problem_type, observation, applus
            )
        `)
        .order('created_at', { ascending: false });

    if (filters?.terminal && filters.terminal !== 'ALL') {
        query = query.eq('terminal_code', filters.terminal);
    }

    if (filters?.status && filters.status !== 'TODOS') {
        query = query.eq('status', filters.status);
    }

    if (filters?.criticality && filters.criticality !== 'TODAS') {
        query = query.eq('criticality', filters.criticality);
    }

    if (filters?.id) {
        query = query.eq('id', filters.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as (SrlRequest & { srl_request_buses: SrlRequestBus[] })[];
}

export async function createSrlRequest(
    request: Partial<SrlRequest>,
    buses: { ppu: string; problem: string; images: File[] }[]
) {
    // Sanitize data
    if (request.required_date === '') {
        request.required_date = null;
    }

    // 1. Create Request Header
    const { data: reqData, error: reqError } = await supabase
        .from('srl_requests')
        .insert(request)
        .select()
        .single();

    if (reqError) throw reqError;

    // 2. Process Buses and Images
    const busErrors: any[] = [];

    for (const bus of buses) {
        // A. Insert Bus
        const { data: busData, error: busError } = await supabase
            .from('srl_request_buses')
            .insert({
                request_id: reqData.id,
                bus_ppu: bus.ppu,
                problem_type: 'GENERAL',
                observation: bus.problem,
                applus: request.applus
            })
            .select()
            .single();

        if (busError) {
            busErrors.push({ bus: bus.ppu, error: busError });
            continue;
        }

        // B. Upload Images
        if (bus.images && bus.images.length > 0) {
            for (const file of bus.images) {
                try {
                    await uploadBusImage(busData.id, file);
                } catch (imgError) {
                    console.error(`Failed to upload image for bus ${bus.ppu}`, imgError);
                }
            }
        }
    }

    // 3. Send Email Notification
    try {
        await sendSrlEmailNotification(reqData.id, 'CREADA');
        console.log('✅ Email notification sent successfully for request:', reqData.id);
    } catch (emailError: any) {
        console.error('❌ Failed to send email notification:', emailError);
        console.error('Email error details:', {
            message: emailError?.message,
            code: emailError?.code,
            details: emailError
        });
        // Don't throw - email failure shouldn't block request creation
        // But alert user that email failed
        alert('⚠️ Solicitud creada correctamente, pero el correo NO se envió. Verifica la configuración de email en SRL.');
    }

    return reqData;
}

export async function updateSrlRequest(id: string, updates: Partial<SrlRequest>) {
    // Sanitize
    if (updates.required_date === '') {
        updates.required_date = null;
    }

    const { data, error } = await supabase
        .from('srl_requests')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// BUSES & IMAGES
// ==========================================

export async function fetchBusImages(busId: string) {
    const { data, error } = await supabase
        .from('srl_bus_images')
        .select('*')
        .eq('request_bus_id', busId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    // Generate Public URLs
    return data.map(img => ({
        ...img,
        publicUrl: supabase.storage.from('srl-images').getPublicUrl(img.storage_path).data.publicUrl
    })) as SrlBusImage[];
}

export async function uploadBusImage(busId: string, file: File) {
    const fileName = `${busId}/${Date.now()}_${file.name}`;

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
        .from('srl-images')
        .upload(fileName, file);

    if (uploadError) throw uploadError;

    // Check DB record creation
    const { data, error: dbError } = await supabase
        .from('srl_bus_images')
        .insert({
            request_bus_id: busId,
            storage_path: fileName,
            mime_type: file.type
        })
        .select()
        .single();

    if (dbError) throw dbError;

    return {
        ...data,
        publicUrl: supabase.storage.from('srl-images').getPublicUrl(fileName).data.publicUrl
    };
}

/**
 * Upload technician document to storage
 */
export async function uploadTechnicianDocument(
    requestId: string,
    file: File
): Promise<string> {
    const fileName = `${requestId}_${Date.now()}_${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('srl-documents')
        .upload(fileName, file);

    if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Error al subir documento: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('srl-documents')
        .getPublicUrl(uploadData.path);

    return publicUrl;
}

// ==========================================
// SETTINGS
// ==========================================

export async function fetchSrlEmailSettings() {
    const { data, error } = await supabase
        .from('srl_email_settings')
        .select('*')
        .limit(1);

    if (error) throw error;
    return data?.[0] || null;
}

export async function updateSrlEmailSettings(settings: Partial<SrlEmailSetting>) {
    // 1. Try to update existing records
    const { data, error } = await supabase
        .from('srl_email_settings')
        .update(settings)
        .gt('id', '00000000-0000-0000-0000-000000000000') // Update any existing row
        .select();

    if (error) throw error;

    // 2. If no rows existed to update, insert a new one
    if (!data || data.length === 0) {
        const { error: insertError } = await supabase
            .from('srl_email_settings')
            .insert(settings);

        if (insertError) throw insertError;
    }

    return true;
}

// ==========================================
// EMAIL LOGIC
// ==========================================

export async function sendSrlEmailNotification(requestId: string, trigger: 'CREADA' | 'STATUS_CHANGE') {
    console.log('📧 Starting email notification for request:', requestId, 'trigger:', trigger);

    // 1. Fetch Request Details with Relations
    console.log('📋 Fetching request details...');
    const { data: request, error } = await supabase
        .from('srl_requests')
        .select(`
            *,
            srl_request_buses (
                id,
                bus_ppu,
                observation,
                problem_type,
                applus
            )
        `)
        .eq('id', requestId)
        .single();

    if (error || !request) {
        console.error('❌ Could not fetch request:', error);
        throw new Error('Could not fetch request for email');
    }
    console.log('✅ Request fetched:', request.terminal_code, request.srl_request_buses.length, 'buses');

    // 2. Fetch Settings
    console.log('⚙️ Fetching email settings...');
    const settings = await fetchSrlEmailSettings();
    console.log('📧 Email settings:', settings);

    if (!settings) {
        console.warn('⚠️ No email settings found in database');
        throw new Error('No hay configuración de email. Ve a SRL → Configuración para configurar los emails.');
    }

    if (!settings.enabled) {
        console.warn('⚠️ Email notifications are DISABLED in settings');
        throw new Error('Las notificaciones por email están DESHABILITADAS. Ve a SRL → Configuración para habilitarlas.');
    }

    if (!settings.recipients || settings.recipients.trim() === '') {
        console.error('❌ No recipients configured');
        throw new Error('No hay destinatarios configurados. Ve a SRL → Configuración para agregar emails.');
    }

    console.log('✅ Email settings valid. Recipients:', settings.recipients);

    // 3. Fetch Images for ALL buses
    const busesWithImages = await Promise.all(
        request.srl_request_buses.map(async (bus: any) => {
            const images = await fetchBusImages(bus.id);
            return { ...bus, images };
        })
    );

    // 4. Build Rich HTML Email with Images
    const busesHtml = busesWithImages.map((bus: any) => {
        const imagesHtml = bus.images.length > 0
            ? bus.images.map((img: any) => `
                <a href="${img.publicUrl}" target="_blank" style="display: inline-block; margin: 5px;">
                    <img src="${img.publicUrl}" alt="Evidencia" style="width: 150px; height: 150px; object-fit: cover; border-radius: 8px; border: 2px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                </a>
            `).join('')
            : '<p style="color: #94a3b8; font-style: italic;">Sin evidencia fotográfica</p>';

        return `
            <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 16px; border-radius: 8px;">
                <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 18px; font-weight: bold;">
                    🚌 PPU: ${bus.bus_ppu}
                </h3>
                <p style="margin: 4px 0; color: #475569;">
                    <strong>Problema:</strong> ${bus.observation || bus.problem_type || 'No especificado'}
                </p>
                ${bus.applus ? '<p style="margin: 4px 0; color: #dc2626; font-weight: bold;">⚠️ Requiere APPLUS</p>' : ''}
                <div style="margin-top: 12px;">
                    <strong style="display: block; margin-bottom: 8px; color: #64748b; font-size: 12px; text-transform: uppercase;">Evidencia Fotográfica:</strong>
                    ${imagesHtml}
                </div>
            </div>
        `;
    }).join('');

    // 5. Build Complete HTML Email
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
    <div style="max-width: 600px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; margin-top: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #3b82f6;">
            <h1 style="margin: 0; color: #1e293b; font-size: 28px; font-weight: 800;">
                ASISS
            </h1>
            <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase;">
                Operaciones y Logística
            </p>
        </div>

        <!-- Badge -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <p style="margin: 0; color: white; font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">
                ${request.terminal_code.replace(/_/g, ' ')} - NOTIFICACIONES LOGÍSTICA
            </p>
        </div>

        <!-- Title -->
        <h2 style="margin: 0 0 24px 0; color: #1e293b; font-size: 24px; font-weight: 700; text-align: center;">
            Solicitud SRL - ${request.terminal_code.replace(/_/g, ' ')} - ${request.srl_request_buses.length} Bus${request.srl_request_buses.length !== 1 ? 'es' : ''}
        </h2>

        <!-- Summary -->
        <div style="background: #fff7ed; border: 2px solid #fed7aa; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0; color: #9a3412; font-weight: 600;">
                Estimados, favor gestionar visita técnica para Buses detallados.
            </p>
        </div>

        <!-- Info Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; background: #f8fafc; padding: 16px; border-radius: 8px;">
            <div>
                <p style="margin: 0 0 4px 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Terminal</p>
                <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: 700;">${request.terminal_code.replace(/_/g, ' ')}</p>
            </div>
            <div>
                <p style="margin: 0 0 4px 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Criticidad</p>
                <p style="margin: 0; color: ${request.criticality === 'ALTA' ? '#dc2626' : request.criticality === 'MEDIA' ? '#f59e0b' : '#64748b'}; font-size: 16px; font-weight: 700;">${request.criticality}</p>
            </div>
            <div>
                <p style="margin: 0 0 4px 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Fecha Solicitud</p>
                <p style="margin: 0; color: #1e293b; font-size: 14px;">${new Date(request.created_at).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}</p>
            </div>
            <div>
                <p style="margin: 0 0 4px 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">ID Solicitud</p>
                <p style="margin: 0; color: #1e293b; font-family: monospace; font-size: 14px;">#${request.id.slice(0, 8)}</p>
            </div>
        </div>

        <!-- Buses Section -->
        <h3 style="margin: 0 0 16px 0; color: #1e293b; font-size: 20px; font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
            Buses Afectados (${request.srl_request_buses.length})
        </h3>
        ${busesHtml}

        <!-- Footer -->
        <div style="margin-top: 32px; padding-top: 24px; border-top: 2px solid #e2e8f0; text-align: center;">
            <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 12px;">
                ${new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <p style="margin: 0; color: #cbd5e1; font-size: 11px;">
                © ${new Date().getFullYear()} Asiss - Operaciones y Logística
            </p>
        </div>
    </div>
</body>
</html>
    `;

    // 6. Send via Shared Service
    console.log('📤 Preparing email payload...');
    const payload: any = {
        audience: 'manual',
        manualRecipients: settings.recipients.split(',').map(e => e.trim()).filter(Boolean),
        subject: `Solicitud SRL - ${request.terminal_code.replace(/_/g, ' ')} - ${request.srl_request_buses.length} Bus${request.srl_request_buses.length !== 1 ? 'es' : ''}`,
        body: htmlBody
    };

    if (settings.cc_emails) {
        payload.cc = settings.cc_emails.split(',').map(e => e.trim()).filter(Boolean);
    }

    console.log('📧 Email payload:', {
        to: payload.manualRecipients,
        cc: payload.cc,
        subject: payload.subject
    });

    console.log('🚀 Sending email via emailService...');
    const result = await emailService.sendEmail(payload as EmailPayload);
    console.log('✅ Email sent successfully:', result);
    return result;
}

// ==========================================
// REALTIME SUBSCRIPTIONS
// ==========================================

export function subscribeToSrlChanges(onChange: () => void): () => void {
    const channel = supabase
        .channel('srl_global_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'srl_requests' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'srl_request_buses' }, onChange)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
