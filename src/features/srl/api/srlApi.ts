import { supabase } from '../../../shared/lib/supabaseClient';
import { SrlRequest, SrlRequestBus, SrlEmailSetting, SrlFilters, SrlStatus, SrlBusImage } from '../types';
import { emailService } from '../../../shared/services/emailService';
import { EmailPayload } from '../../../shared/types/email';
import { useToastStore } from '../../../shared/state/toastStore';

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

        // Alert via Toast
        useToastStore.getState().addToast({
            type: 'warning',
            title: 'Correo no enviado',
            message: 'Solicitud creada, pero falló el envío del correo. Verifica la configuración de email en SRL.',
            duration: 8000
        });
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

    // 2. Fetch Settings
    const settings = await fetchSrlEmailSettings();

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

    // 3. Fetch Images for ALL buses (Defensive)
    const busesWithImages = await Promise.all(
        (request.srl_request_buses || []).map(async (bus: any) => {
            try {
                const images = await fetchBusImages(bus.id);
                return { ...bus, images: images || [] };
            } catch (err) {
                console.error('Error fetching images for bus:', bus.id, err);
                return { ...bus, images: [] };
            }
        })
    );

    // 4. Build Professional HTML Email
    const criticalityColors = {
        BAJA: '#10b981', // Emerald 500
        MEDIA: '#f59e0b', // Amber 500
        ALTA: '#ef4444'   // Red 500
    };

    const critColor = criticalityColors[request.criticality as keyof typeof criticalityColors] || '#64748b';
    const statusLabel = trigger === 'CREADA' ? 'NUEVA SOLICITUD' : 'ACTUALIZACIÓN';

    const busesHtml = busesWithImages.map((bus: any) => {
        const imagesHtml = bus.images.length > 0
            ? `
                <div style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
                    ${bus.images.map((img: any) => `
                        <a href="${img.publicUrl}" target="_blank" style="text-decoration: none;">
                            <img src="${img.publicUrl}" alt="Evidencia" style="width: 140px; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; display: inline-block; margin-right: 8px; margin-bottom: 8px;">
                        </a>
                    `).join('')}
                </div>
              `
            : '<p style="color: #94a3b8; font-size: 13px; font-style: italic; margin: 4px 0;">Sin evidencia fotográfica adjunta.</p>';

        return `
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="background-color: #3b82f6; color: white; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 700;">${bus.bus_ppu}</span>
                        ${bus.applus ? '<span style="background-color: #fee2e2; color: #dc2626; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid #fecaca; margin-left: 12px; white-space: nowrap;">⚠️ RECHAZO POR APPLUS</span>' : ''}
                    </div>
                    <span style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">${bus.problem_type || 'General'}</span>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <p style="margin: 0 0 4px 0; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Observación / Problema</p>
                    <p style="margin: 0; color: #334155; font-size: 15px; line-height: 1.5;">
                        ${bus.observation || 'Sin observación detallada.'}
                    </p>
                </div>

                <div>
                   ${imagesHtml}
                </div>
            </div>
        `;
    }).join('');

    const htmlBody = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Notificación SRL</title>
    <style type="text/css">
        body, td, div, p, a, input, button { font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; -webkit-text-size-adjust: none;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f8;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <!-- Main Container -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 680px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: 1px;">ASISS</h1>
                            <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">Gestión de Flota & Logística</p>
                        </td>
                    </tr>

                    <!-- Status Banner -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 0;">
                            <div style="background-color: ${critColor}; height: 6px; width: 100%;"></div>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            
                            <!-- Headline -->
                            <div style="text-align: center; margin-bottom: 32px;">
                                <span style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #475569; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
                                    ${statusLabel}
                                </span>
                                <h2 style="margin: 0; color: #1e293b; font-size: 28px; font-weight: 800; line-height: 1.2;">
                                    Solicitud en ${request.terminal_code.replace(/_/g, ' ')}
                                </h2>
                                <p style="margin: 8px 0 0 0; color: #64748b; font-size: 16px;">
                                    Estimados, solicitamos gestionar la reparación de la flota adjunta a la brevedad posible. Quedamos atentos a su respuesta.
                                </p>
                            </div>

                            <!-- Info Grid -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #f1f5f9;">
                                <tr>
                                    <td style="padding: 20px; border-right: 1px solid #e2e8f0; width: 33%;">
                                        <p style="margin: 0 0 4px 0; color: #94a3b8; font-size: 10px; font-weight: 700; text-transform: uppercase;">Terminal</p>
                                        <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: 700;">${request.terminal_code.replace(/_/g, ' ')}</p>
                                    </td>
                                    <td style="padding: 20px; border-right: 1px solid #e2e8f0; width: 33%;">
                                        <p style="margin: 0 0 4px 0; color: #94a3b8; font-size: 10px; font-weight: 700; text-transform: uppercase;">Criticidad</p>
                                        <p style="margin: 0; color: ${critColor}; font-size: 14px; font-weight: 700;">${request.criticality}</p>
                                    </td>
                                    <td style="padding: 20px; width: 33%;">
                                        <p style="margin: 0 0 4px 0; color: #94a3b8; font-size: 10px; font-weight: 700; text-transform: uppercase;">Fecha</p>
                                        <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: 600;">${new Date(request.created_at).toLocaleDateString('es-CL')}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Buses Section Title -->
                            <div style="margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                                <h3 style="margin: 0; color: #334155; font-size: 18px; font-weight: 700;">Detalle de Flota</h3>
                                <span style="background-color: #eff6ff; color: #3b82f6; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">${request.srl_request_buses.length} Bus${request.srl_request_buses.length !== 1 ? 'es' : ''}</span>
                            </div>

                            <!-- Bus List -->
                            ${busesHtml}


                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 32px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                                Este es un mensaje generado automáticamente por el sistema <strong>ASISS</strong>.<br/>
                                Por favor no responder directamente a este correo.
                            </p>
                            <p style="margin: 0; color: #cbd5e1; font-size: 11px;">
                                © ${new Date().getFullYear()} Asiss - Operaciones y Logística Intregrada
                            </p>
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>
</body>
</html>
    `;

    // 6. Send via Shared Service
    console.log('📤 Preparing email payload...');
    const payload: any = {
        audience: 'manual',
        manualRecipients: settings.recipients.split(',').map((e: string) => e.trim()).filter(Boolean),
        subject: `[SRL] ${request.terminal_code.replace(/_/g, ' ')} - ${request.criticality} - ${request.srl_request_buses.length} Buses`,
        body: htmlBody
    };

    // Validate and process CC emails
    const validCcEmails: string[] = [];
    if (settings.cc_emails) {
        const rawCcs = settings.cc_emails.split(',').map((e: string) => e.trim());
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (const email of rawCcs) {
            if (email && emailRegex.test(email)) {
                validCcEmails.push(email);
            } else if (email) {
                console.warn(`⚠️ Skipping invalid CC email: "${email}"`);
            }
        }
    }

    if (validCcEmails.length > 0) {
        payload.cc = validCcEmails;
    }

    console.log('🚀 Sending professional email...');
    const result = await emailService.sendEmail(payload as EmailPayload);
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
