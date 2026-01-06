import { useState, useEffect } from 'react';
import { Icon } from '../../../shared/components/common/Icon';
import { RutLookupInput } from '../../asistencia/components/RutLookupInput';
import { Staff } from '../../personal/types';
import { SANCTION_CODES } from '../constants';
import { AmonestacionFormData } from '../types';
import { generateAmonestacionPDF } from '../utils/pdfGenerator';
import { format } from 'date-fns';

interface Props {
    open: boolean;
    onClose: () => void;
    currentUserName: string;
    currentUserCargo: string;
}

export const AmonestacionFormModal = ({ open, onClose, currentUserName, currentUserCargo }: Props) => {
    const [selectedCodeId, setSelectedCodeId] = useState<string>('');
    const [worker, setWorker] = useState<Staff | null>(null);
    const [evidence, setEvidence] = useState('');
    const [manualFacts, setManualFacts] = useState('');

    // Detailed State
    const [formData, setFormData] = useState<Partial<AmonestacionFormData>>({
        date: format(new Date(), 'dd/MM/yyyy'),
        time: format(new Date(), 'HH:mm'),
        responsible_name: currentUserName || 'Cristian Marcelo Luraschi Muñoz',
        responsible_cargo: currentUserCargo || 'Jefe de Terminal'
    });

    const handleWorkerFound = (s: Staff | null) => {
        setWorker(s);
        if (s) {
            setFormData(prev => ({
                ...prev,
                worker_rut: s.rut,
                worker_name: s.nombre,
                worker_cargo: s.cargo,
                worker_base: s.terminal_code // Assuming base = terminal
            }));
        }
    };

    useEffect(() => {
        if (!selectedCodeId || !worker) return;

        const code = SANCTION_CODES.find(c => c.code.toString() === selectedCodeId);
        if (!code) return;

        setEvidence(code.evidence_required);

        // --- SMART LEGAL NARRATIVE GENERATOR ---
        // --- SMART LEGAL NARRATIVE GENERATOR (UPDATED FORMAT) ---
        // Header: NAME, RUT, CARGO, EN TERMINAL [TERMINAL], CON TURNO PROGRAMADO DE [TURNO], EL DÍA [FECHA]

        const workerName = (formData.worker_name || "____________________").toUpperCase();
        const workerRut = (formData.worker_rut || "____________________").toUpperCase();
        const workerCargo = (formData.worker_cargo || "CONDUCTOR").toUpperCase();
        const terminalStr = (formData.place_terminal || "[LUGAR/TERMINAL]").toUpperCase();
        const shiftStr = (formData.shift_schedule || "____________").toUpperCase();
        const dateStr = (formData.date || "________").toUpperCase();

        // 1. HEADER
        const header = `${workerName}, RUT: ${workerRut}, ${workerCargo}, EN TERMINAL ${terminalStr}, CON TURNO PROGRAMADO DE ${shiftStr}, EL DÍA ${dateStr}.`;

        // 2. CONSTATATION & FACTS
        const factsEncoded = manualFacts
            ? manualFacts.toUpperCase()
            : `[DESCRIBA DETALLADAMENTE LA SITUACIÓN: EJ. A ESO DE LAS 20:10 HORAS, EL COLABORADOR RECIBE LA INSTRUCCIÓN...]`;

        const body = `\n\nSE CONSTATA QUE ${factsEncoded}`;

        // 3. CLOSING
        const closing = `\n\nCAYENDO EN FALTA GRAVE (CÓDIGO ${code.code}).`;

        const fullText = `${header}${body}${closing}`;

        setFormData(prev => ({ ...prev, description: fullText, sanction_code_id: code.code }));

    }, [selectedCodeId, worker, formData, manualFacts]);

    const handleGenerate = () => {
        if (!worker || !formData.sanction_code_id) return;
        generateAmonestacionPDF(formData as AmonestacionFormData);
        onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl max-h-[95vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-bold">Nueva Amonestación</h3>
                        <p className="text-xs text-slate-400">Complete los datos para generar el Acta de Constatación</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                        <Icon name="x" size={24} className="text-white" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* LEFT COLUMN (Inputs) - Span 7 */}
                        <div className="lg:col-span-7 space-y-5">

                            {/* 1. Worker & 2. Code Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="font-bold mb-3 text-indigo-700 text-xs uppercase tracking-wide flex items-center gap-2">
                                        <Icon name="user" size={14} /> 1. Infractor
                                    </h3>
                                    <RutLookupInput
                                        value={formData.worker_rut || ''}
                                        onChange={(val) => setFormData(p => ({ ...p, worker_rut: val }))}
                                        onStaffFound={handleWorkerFound}
                                    />
                                    {worker && (
                                        <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                            <p className="font-medium text-slate-800">{worker.nombre}</p>
                                            <p>{worker.cargo} - {worker.terminal_code}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="font-bold mb-3 text-indigo-700 text-xs uppercase tracking-wide flex items-center gap-2">
                                        <Icon name="alert-triangle" size={14} /> 2. Falta
                                    </h3>
                                    <select
                                        className="input w-full text-xs"
                                        onChange={(e) => setSelectedCodeId(e.target.value)}
                                        value={selectedCodeId}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {SANCTION_CODES.map(code => (
                                            <option key={code.code} value={code.code.toString()}>
                                                ({code.code}) {code.severity}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedCodeId && (
                                        <div className="mt-2 p-2 bg-amber-50 text-amber-900 text-[10px] rounded border border-amber-200 leading-tight">
                                            {SANCTION_CODES.find(c => c.code.toString() === selectedCodeId)?.description}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 3. Facts Input */}
                            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 shadow-sm ring-1 ring-blue-500/20">
                                <h3 className="font-bold mb-2 text-blue-700 text-xs uppercase tracking-wide flex items-center gap-2">
                                    <Icon name="edit" size={14} /> 3. Hechos (Relato del Supervisor)
                                </h3>
                                <textarea
                                    className="input w-full min-h-[100px] p-3 text-sm focus:ring-blue-500 bg-white"
                                    placeholder="Describa DETALLADAMENTE lo sucedido..."
                                    value={manualFacts}
                                    onChange={(e) => setManualFacts(e.target.value)}
                                />
                            </div>

                            {/* 4. Time & Place */}
                            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="font-bold mb-3 text-indigo-700 text-xs uppercase tracking-wide flex items-center gap-2">
                                    <Icon name="building" size={14} /> 4. Coordenadas
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="col-span-1">
                                        <label className="label text-[10px]">Fecha</label>
                                        <input type="text" className="input text-xs" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                    </div>
                                    <div className="col-span-1">
                                        <label className="label text-[10px]">Hora</label>
                                        <input type="text" className="input text-xs" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="label text-[10px]">Lugar / Terminal</label>
                                        <input className="input text-xs w-full" value={formData.place_terminal} onChange={e => setFormData({ ...formData, place_terminal: e.target.value })} />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="label text-[10px] text-indigo-700 font-bold">Turno del Trabajador (Requerido)</label>
                                        <input
                                            className="input text-xs w-full border-indigo-200 bg-indigo-50/30"
                                            placeholder="Ej: 06:00 a 14:00"
                                            value={formData.shift_schedule || ''}
                                            onChange={e => setFormData({ ...formData, shift_schedule: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 5. Testigos */}
                            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="font-bold mb-3 text-indigo-700 text-xs uppercase tracking-wide flex items-center gap-2">
                                    <Icon name="users" size={14} /> 5. Testigos
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Witness 1 */}
                                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                                        <label className="text-[10px] font-bold text-slate-500 mb-1 block">TESTIGO 1 (Principal)</label>
                                        <div className="mb-2">
                                            <RutLookupInput
                                                value={formData.witness1_rut || ''}
                                                onChange={(val) => setFormData(p => ({ ...p, witness1_rut: val }))}
                                                onStaffFound={(s) => s && setFormData(p => ({ ...p, witness1_name: s.nombre, witness1_rut: s.rut, witness1_cargo: s.cargo }))}
                                            />
                                        </div>
                                        <input className="input text-xs w-full mb-1" placeholder="Nombre" value={formData.witness1_name} onChange={e => setFormData(p => ({ ...p, witness1_name: e.target.value }))} />
                                        <input className="input text-xs w-full" placeholder="Cargo" value={formData.witness1_cargo} onChange={e => setFormData(p => ({ ...p, witness1_cargo: e.target.value }))} />
                                    </div>

                                    {/* Witness 2 */}
                                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                                        <div className="flex justify-between mb-1">
                                            <label className="text-[10px] font-bold text-slate-500">TESTIGO 2 (Opcional)</label>
                                            <button onClick={() => setFormData(p => ({ ...p, witness2_name: '', witness2_rut: '', witness2_cargo: '' }))} className="text-[10px] text-red-500 hover:text-red-700">Borrar</button>
                                        </div>
                                        <div className="mb-2">
                                            <RutLookupInput
                                                value={formData.witness2_rut || ''}
                                                onChange={(val) => setFormData(p => ({ ...p, witness2_rut: val }))}
                                                onStaffFound={(s) => s && setFormData(p => ({ ...p, witness2_name: s.nombre, witness2_rut: s.rut, witness2_cargo: s.cargo }))}
                                            />
                                        </div>
                                        <input className="input text-xs w-full mb-1" placeholder="Nombre" value={formData.witness2_name} onChange={e => setFormData(p => ({ ...p, witness2_name: e.target.value }))} />
                                        <input className="input text-xs w-full" placeholder="Cargo" value={formData.witness2_cargo} onChange={e => setFormData(p => ({ ...p, witness2_cargo: e.target.value }))} />
                                    </div>
                                </div>
                            </div>

                            {/* 6. Responsable */}
                            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="font-bold mb-3 text-indigo-700 text-xs uppercase tracking-wide flex items-center gap-2">
                                    <Icon name="briefcase" size={14} /> 6. Responsable
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <input className="input text-xs" readOnly value={formData.responsible_name} />
                                    <input className="input text-xs" readOnly value={formData.responsible_cargo} />
                                </div>
                            </div>

                        </div>

                        {/* RIGHT COLUMN (Preview) - Span 5 */}
                        <div className="lg:col-span-5 flex flex-col h-full min-h-[500px]">
                            <div className="bg-slate-800 text-slate-400 text-xs px-4 py-2 rounded-t-xl border-b border-slate-700 flex justify-between items-center">
                                <span className="font-medium text-white flex gap-2 items-center"><Icon name="file-text" size={14} /> Vista Previa Documento</span>
                                <span>A4 - Generado Auto.</span>
                            </div>
                            <div className="flex-1 bg-white border-x border-b border-slate-300 p-6 shadow-inner rounded-b-xl relative overflow-hidden">
                                <textarea
                                    className="w-full h-full resize-none font-mono text-[10px] leading-relaxed text-slate-600 outline-none border-none bg-transparent"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0 z-10">
                    <div className="text-xs text-slate-500">
                        * Revise bien los datos antes de generar. El PDF es un documento legal.
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors text-sm">
                            Cancelar
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={!worker || !selectedCodeId}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-transform active:scale-95"
                        >
                            <Icon name="download" size={16} />
                            Generar Documento
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
