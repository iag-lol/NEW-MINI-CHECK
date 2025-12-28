import { useState, useEffect } from 'react';
import { Icon } from '../../../shared/components/common/Icon';
import { useCreateAseoRecord } from '../hooks';
import { searchVehiclesByPpu, type FleetVehicle } from '../api/fleetApi';
import type { CleaningType } from '../types';

interface Props {
    cleanerId: string;
    cleanerName: string;
}

const TERMINALS = ['EL_ROBLE', 'LA_REINA', 'MARIA_ANGELICA', 'EL_DESCANSO'];
const CLEANING_TYPES: Array<{ value: CleaningType; label: string; color: string }> = [
    { value: 'BARRIDO', label: 'Barrido', color: 'from-blue-500 to-blue-600' },
    { value: 'BARRIDO_Y_TRAPEADO', label: 'Barrido + Trapeado', color: 'from-indigo-500 to-indigo-600' },
    { value: 'FULL', label: 'Aseo Completo', color: 'from-purple-500 to-purple-600' }
];

export const AseoForm = ({ cleanerId, cleanerName }: Props) => {
    const [busNumber, setBusNumber] = useState('');
    const [terminal, setTerminal] = useState(TERMINALS[0]);
    const [cleaningType, setCleaningType] = useState<CleaningType>('BARRIDO');
    const [graffitiRemoved, setGraffitiRemoved] = useState(false);
    const [stickersRemoved, setStickersRemoved] = useState(false);
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // Autocomplete states
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<FleetVehicle[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    const createMutation = useCreateAseoRecord();

    // Autocomplete search
    useEffect(() => {
        const searchVehicles = async () => {
            if (searchTerm.length < 2) {
                setSuggestions([]);
                return;
            }

            setIsSearching(true);
            try {
                const results = await searchVehiclesByPpu(searchTerm, terminal);
                setSuggestions(results);
                setShowSuggestions(true);
            } catch (error) {
                console.error('Error searching vehicles:', error);
                setSuggestions([]);
            } finally {
                setIsSearching(false);
            }
        };

        const debounce = setTimeout(searchVehicles, 300);
        return () => clearTimeout(debounce);
    }, [searchTerm, terminal]);

    const handleSelectVehicle = (vehicle: FleetVehicle) => {
        setSelectedVehicle(vehicle);
        setBusNumber(vehicle.ppu);
        setSearchTerm(vehicle.ppu);
        setTerminal(vehicle.terminal);
        setShowSuggestions(false);
    };

    const handleSearchChange = (value: string) => {
        setSearchTerm(value.toUpperCase());
        setBusNumber(value.toUpperCase());
        setSelectedVehicle(null);
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhoto(file);
            const reader = new FileReader();
            reader.onloadend = () => setPhotoPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!busNumber.trim()) {
            alert('Ingresa el número de patente');
            return;
        }
        if (!photo) {
            alert('Debes tomar una foto');
            return;
        }

        try {
            await createMutation.mutateAsync({
                cleanerId,
                cleanerName,
                input: {
                    bus_ppu: busNumber.trim().toUpperCase(),
                    terminal_code: terminal,
                    cleaning_type: cleaningType,
                    graffiti_removed: graffitiRemoved,
                    stickers_removed: stickersRemoved
                },
                photo
            });

            // Reset form
            setBusNumber('');
            setSearchTerm('');
            setSelectedVehicle(null);
            setGraffitiRemoved(false);
            setStickersRemoved(false);
            setPhoto(null);
            setPhotoPreview(null);

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            alert('✅ ¡Registro guardado exitosamente!');
        } catch (error) {
            console.error(error);
            alert('❌ Error al guardar. Intenta nuevamente.');
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Nuevo Registro</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Bus Number with Autocomplete */}
                    <div className="relative">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Patente del Bus
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-lg uppercase"
                                placeholder="Buscar PPU..."
                                value={searchTerm}
                                onChange={e => handleSearchChange(e.target.value)}
                                onFocus={() => setShowSuggestions(true)}
                                autoComplete="off"
                            />
                            {isSearching && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Icon name="loader" size={20} className="animate-spin text-blue-500" />
                                </div>
                            )}
                        </div>

                        {/* Autocomplete Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-2 bg-white border-2 border-slate-300 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                {suggestions.map((vehicle) => (
                                    <button
                                        key={vehicle.ppu}
                                        type="button"
                                        onClick={() => handleSelectVehicle(vehicle)}
                                        className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-slate-200 last:border-0"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-bold text-slate-900">{vehicle.ppu}</div>
                                                <div className="text-sm text-slate-600">
                                                    {vehicle.marca_modelo} • Nº{vehicle.numero_interno}
                                                </div>
                                            </div>
                                            <div className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-semibold">
                                                {vehicle.terminal.replace(/_/g, ' ')}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Selected Vehicle Info */}
                        {selectedVehicle && (
                            <div className="mt-2 p-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                                <div className="flex items-center gap-2">
                                    <Icon name="check-circle" size={20} className="text-emerald-600" />
                                    <div className="text-sm">
                                        <span className="font-bold text-emerald-900">{selectedVehicle.marca_modelo}</span>
                                        <span className="text-emerald-700"> • Interno #{selectedVehicle.numero_interno}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Terminal */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Terminal
                        </label>
                        <select
                            className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-lg"
                            value={terminal}
                            onChange={e => setTerminal(e.target.value)}
                        >
                            {TERMINALS.map(t => (
                                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                    </div>

                    {/* Cleaning Type */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-3">
                            Tipo de Aseo
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {CLEANING_TYPES.map(type => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setCleaningType(type.value)}
                                    className={`p-4 rounded-xl font-bold transition-all ${cleaningType === type.value
                                        ? `bg-gradient-to-r ${type.color} text-white shadow-lg scale-105`
                                        : 'bg-slate-100 text-slate-700 border-2 border-slate-300'
                                        }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Additional Options */}
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => setGraffitiRemoved(!graffitiRemoved)}
                            className={`w-full p-4 rounded-xl font-semibold transition-all ${graffitiRemoved
                                ? 'bg-emerald-500 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-700 border-2 border-slate-300'
                                }`}
                        >
                            <Icon name={graffitiRemoved ? 'check-circle' : 'x-circle'} size={20} className="inline mr-2" />
                            Graffitis Retirados
                        </button>
                        <button
                            type="button"
                            onClick={() => setStickersRemoved(!stickersRemoved)}
                            className={`w-full p-4 rounded-xl font-semibold transition-all ${stickersRemoved
                                ? 'bg-emerald-500 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-700 border-2 border-slate-300'
                                }`}
                        >
                            <Icon name={stickersRemoved ? 'check-circle' : 'x-circle'} size={20} className="inline mr-2" />
                            Stickers Retirados
                        </button>
                    </div>

                    {/* Photo */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Foto (Obligatorio)
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            id="photo-upload"
                            className="hidden"
                            onChange={handlePhotoChange}
                        />
                        <label
                            htmlFor="photo-upload"
                            className="block w-full cursor-pointer"
                        >
                            {photoPreview ? (
                                <div className="relative rounded-xl overflow-hidden border-4 border-emerald-500">
                                    <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover" />
                                    <div className="absolute top-2 right-2 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                                        <Icon name="check" size={14} className="inline mr-1" />
                                        Foto capturada
                                    </div>
                                </div>
                            ) : (
                                <div className="border-4 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                                    <Icon name="image" size={48} className="text-slate-400 mx-auto mb-3" />
                                    <p className="text-slate-600 font-semibold">Toca para tomar foto</p>
                                </div>
                            )}
                        </label>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={createMutation.isPending || !photo}
                        className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
                    >
                        {createMutation.isPending ? 'Guardando...' : 'Guardar Registro'}
                    </button>
                </form>
            </div>
        </div>
    );
};
