import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { RutLookupInput } from '../../asistencia/components/RutLookupInput';
import { Staff } from '../../personal/types';
import { SANCTION_CODES } from '../constants';
import { AmonestacionFormData } from '../types';
import { generateAmonestacionPDF } from '../utils/pdfGenerator';
import { format } from 'date-fns';

interface Props {
    open: boolean;
    onClose: () => void;
    currentUserName: string; // To auto-fill responsible
    currentUserCargo: string;
}

export const AmonestacionFormModal = ({ open, onClose, currentUserName, currentUserCargo }: Props) => {
    const [step, setStep] = useState(1);
    const [selectedCodeId, setSelectedCodeId] = useState<string>('');
    const [worker, setWorker] = useState<Staff | null>(null);
    const [evidence, setEvidence] = useState('');

    // Detailed State
    const [formData, setFormData] = useState<Partial<AmonestacionFormData>>({
        date: format(new Date(), 'dd/MM/yyyy'),
        time: format(new Date(), 'HH:mm'),
        responsible_name: currentUserName,
        responsible_cargo: currentUserCargo
    });

    const handleWorkerFound = (s: Staff | null) => {
        setWorker(s);
        if (s) {
            setFormData(prev => ({
                ...prev,
                worker_rut: s.rut,
                worker_name: `${s.nombres} ${s.apellidos}`,
                worker_cargo: s.cargo,
                worker_base: s.terminal_code // Assuming base = terminal
            }));
        }
    };

    // Smart Fill Logic
    useEffect(() => {
        if (!selectedCodeId || !worker) return;

        const code = SANCTION_CODES.find(c => c.code.toString() === selectedCodeId);
        if (!code) return;

        setEvidence(code.evidence_required);

        // Auto-generate description if template exists, or use default
        let desc = code.template || '';

        // No template? Use generic fallback
        if (!desc) {
            desc = `EL TRABAJADOR [NOMBRE_TRABAJADOR], RUT [RUT_TRABAJADOR], INCURRIÓ EN LA FALTA TIPIFICADA EN EL CÓDIGO [CODIGO]: ${code.description.toUpperCase()}. \n\nSE PROCEDE A LEVANTAR LA PRESENTE AMONESTACIÓN CONFORME AL REGLAMENTO INTERNO DE ORDEN, HIGIENE Y SEGURIDAD.`;
        }

        // Replace Placeholders
        desc = desc
            .replace(/\[NOMBRE_TRABAJADOR\]/g, formData.worker_name || '')
            .replace(/\[RUT_TRABAJADOR\]/g, formData.worker_rut || '')
            .replace(/\[CARGO_TRABAJADOR\]/g, formData.worker_cargo || '')
            .replace(/\[BASE_TRABAJADOR\]/g, formData.worker_base || '')
            .replace(/\[FECHA\]/g, formData.date || '')
            .replace(/\[CODIGO\]/g, code.code.toString());

        setFormData(prev => ({ ...prev, description: desc, sanction_code_id: code.code }));

    }, [selectedCodeId, worker, formData.worker_name, formData.date]);

    const handleGenerate = () => {
        if (!worker || !formData.sanction_code_id) return;
        generateAmonestacionPDF(formData as AmonestacionFormData);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-full">
                <DialogHeader>
                    <DialogTitle>Nueva Amonestación / Constatación de Hechos</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                    {/* COL 1: Basic Info */}
                    <div className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-lg border">
                            <h3 className="font-semibold mb-3 text-indigo-600">1. Infractor</h3>
                            <RutLookupInput
                                value={formData.worker_rut || ''}
                                onChange={(val) => setFormData(prev => ({ ...prev, worker_rut: val }))}
                                onStaffFound={handleWorkerFound}
                            />
                            {worker && (
                                <div className="mt-2 text-sm text-slate-600">
                                    <p><strong>Nombre:</strong> {worker.nombres} {worker.apellidos}</p>
                                    <p><strong>Cargo:</strong> {worker.cargo}</p>
                                    <p><strong>Base:</strong> {worker.terminal_code}</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50 rounded-lg border">
                            <h3 className="font-semibold mb-3 text-indigo-600">2. Falta (Código)</h3>
                            <Label>Seleccionar Falta</Label>
                            <Select onValueChange={setSelectedCodeId} value={selectedCodeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Buscar código..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                    {SANCTION_CODES.map(code => (
                                        <SelectItem key={code.code} value={code.code.toString()}>
                                            Cod {code.code} - {code.severity} - {code.description.substring(0, 50)}...
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedCodeId && (
                                <div className="mt-2 p-2 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200">
                                    <strong>Evidencia Requerida:</strong> {evidence}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50 rounded-lg border">
                            <h3 className="font-semibold mb-3 text-indigo-600">3. Lugar y Hora</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <div><Label>Fecha</Label><Input value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
                                <div><Label>Hora</Label><Input value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} /></div>
                            </div>
                            <div className="mt-2"><Label>Terminal/Lugar</Label><Input value={formData.place_terminal} onChange={e => setFormData({ ...formData, place_terminal: e.target.value })} placeholder="Ej: Terminal El Roble" /></div>
                            <div className="mt-2"><Label>PPU / Vehículo</Label><Input value={formData.place_ppu} onChange={e => setFormData({ ...formData, place_ppu: e.target.value })} placeholder="Opcional" /></div>
                        </div>
                    </div>

                    {/* COL 2: Narrative & Witnesses */}
                    <div className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-lg border h-full flex flex-col">
                            <h3 className="font-semibold mb-3 text-indigo-600">4. Relato de los Hechos (Automático)</h3>
                            <Textarea
                                className="flex-1 min-h-[200px] font-mono text-sm leading-relaxed"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                            <p className="text-xs text-slate-400 mt-2">* Puedes editar el texto generado automáticamente si es necesario.</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-slate-50 rounded-lg border">
                        <h3 className="font-semibold mb-3 text-indigo-600">5. Involucrados</h3>
                        <Input className="mb-2" placeholder="Jefatura" value={formData.involved_jefatura} onChange={e => setFormData({ ...formData, involved_jefatura: e.target.value })} />
                        <Input className="mb-2" placeholder="Compañeros" value={formData.involved_companeros} onChange={e => setFormData({ ...formData, involved_companeros: e.target.value })} />
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg border">
                        <h3 className="font-semibold mb-3 text-indigo-600">6. Testigos</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Nombre Testigo 1" value={formData.witness1_name} onChange={e => setFormData({ ...formData, witness1_name: e.target.value })} />
                            <Input placeholder="RUT Testigo 1" value={formData.witness1_rut} onChange={e => setFormData({ ...formData, witness1_rut: e.target.value })} />
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-6">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleGenerate} disabled={!worker || !selectedCodeId} className="bg-indigo-600 hover:bg-indigo-700">
                        Generar PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
