import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../../shared/components/common/Icon';
import { supabase } from '../../../shared/lib/supabaseClient';

interface Props {
    onLogin: (rut: string, fullName: string, cleanerId: string) => void;
}

export const AseoRutLogin = ({ onLogin }: Props) => {
    const [rut, setRut] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const formatRut = (value: string) => {
        // Remove all non-alphanumeric except hyphen temporarily
        const cleaned = value.toUpperCase().replace(/[^0-9K-]/g, '');

        // Remove any existing hyphens to reformat
        const withoutHyphen = cleaned.replace(/-/g, '');

        // If less than 2 characters, just show as is
        if (withoutHyphen.length < 2) {
            setRut(withoutHyphen);
            return;
        }

        // Auto-format with hyphen before last character
        const body = withoutHyphen.slice(0, -1);
        const verifier = withoutHyphen.slice(-1);
        const formatted = `${body}-${verifier}`;

        setRut(formatted);
    };

    const formatRutWithHyphen = (rut: string): string => {
        // Remove all non-alphanumeric characters
        const cleaned = rut.toUpperCase().replace(/[^0-9K]/g, '');

        if (cleaned.length < 2) return cleaned;

        // Add hyphen before last character (verifier digit)
        const body = cleaned.slice(0, -1);
        const verifier = cleaned.slice(-1);
        return `${body}-${verifier}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Format RUT with hyphen for database search
            const formattedRut = formatRutWithHyphen(rut);

            // 1. Buscar en staff_2026 por RUT para obtener nombre completo
            const { data: staffData, error: staffError } = await supabase
                .from('staff_2026')
                .select('nombre, rut')
                .eq('rut', formattedRut)
                .single();

            if (staffError || !staffData) {
                setError('RUT no encontrado en el sistema de asistencia');
                setIsLoading(false);
                return;
            }

            // 2. Buscar o crear cleaner en aseo_cleaners
            let { data: cleanerData, error: cleanerError } = await supabase
                .from('aseo_cleaners')
                .select('*')
                .eq('name', staffData.nombre)
                .single();

            if (cleanerError || !cleanerData) {
                // Crear nuevo cleaner
                const { data: newCleaner, error: createError } = await supabase
                    .from('aseo_cleaners')
                    .insert({ name: staffData.nombre })
                    .select()
                    .single();

                if (createError || !newCleaner) {
                    setError('Error al registrar limpiador');
                    setIsLoading(false);
                    return;
                }

                cleanerData = newCleaner;
            }

            // 3. Actualizar last_active_at
            await supabase
                .from('aseo_cleaners')
                .update({ last_active_at: new Date().toISOString() })
                .eq('id', cleanerData.id);

            // 4. Login exitoso
            onLogin(formattedRut, staffData.nombre, cleanerData.id);
        } catch (err) {
            setError('Error al conectar con el servidor');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-lg rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-2xl">
                        <Icon name="sparkles" size={40} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-white mb-2">Portal Aseo</h1>
                    <p className="text-blue-100 text-lg">Bienvenido</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-3xl shadow-2xl p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Ingresa tu RUT
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Icon name="user" size={20} className="text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={(e) => formatRut(e.target.value)}
                                    placeholder="12345678-9"
                                    className="w-full pl-12 pr-4 py-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-lg font-semibold text-slate-900 placeholder:text-slate-400"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                                Usa el RUT registrado en el sistema de asistencia
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-2xl animate-in fade-in">
                                <Icon name="alert-circle" size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm font-semibold text-red-700">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading || !rut}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        >
                            {isLoading ? (
                                <>
                                    <Icon name="loader" size={24} className="animate-spin" />
                                    Verificando...
                                </>
                            ) : (
                                <>
                                    <Icon name="check" size={24} />
                                    Ingresar
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t-2 border-slate-100">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Icon name="info" size={16} className="flex-shrink-0" />
                            <p>
                                Tu información se sincroniza automáticamente con el sistema de asistencia
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center text-white/80 text-sm">
                    <p>Sistema de Gestión de Limpieza</p>
                    <p className="text-white/60 text-xs mt-1">ASIS - Asistencia y Servicios</p>
                </div>
            </div>
        </div>
    );
};
