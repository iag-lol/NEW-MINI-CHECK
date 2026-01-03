import { useState, useEffect, useRef } from 'react';
import { fetchStaffByRut } from '../../personal/api';
import { Staff } from '../../personal/types';
import { formatRut, normalizeRut, validateRut } from '../../personal/utils/rutUtils';
import { Icon } from '../../../shared/components/common/Icon';

interface Props {
    value: string;
    onChange: (rut: string) => void;
    onStaffFound: (staff: Staff | null) => void;
    disabled?: boolean;
}

export const RutLookupInput = ({ value, onChange, onStaffFound, disabled }: Props) => {
    const [displayValue, setDisplayValue] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [found, setFound] = useState(false);

    useEffect(() => {
        if (value) {
            setDisplayValue(formatRut(value));
        }
    }, [value]);

    const handleChange = (input: string) => {
        setDisplayValue(input);
        setError(null);
        setFound(false);

        const validation = validateRut(input);
        if (validation.valid) {
            const normalized = normalizeRut(input);
            onChange(normalized);
            lookupStaff(normalized);
        } else {
            onChange('');
            onStaffFound(null);
        }
    };

    const lastLookedUpRut = useRef<string>('');

    const lookupStaff = async (rut: string) => {
        lastLookedUpRut.current = rut;
        setIsSearching(true);
        try {
            const staff = await fetchStaffByRut(rut);
            // Verify this is still the most recent request
            if (rut !== lastLookedUpRut.current) return;

            if (staff) {
                setFound(true);
                setError(null); // Explicitly clear error
                onStaffFound(staff);
            } else {
                setFound(false); // Explicitly clear found
                setError('RUT no encontrado en Personal');
                onStaffFound(null);
            }
        } catch (err) {
            if (rut !== lastLookedUpRut.current) return;
            setError('Error al buscar RUT');
            setFound(false);
            onStaffFound(null);
        } finally {
            if (rut === lastLookedUpRut.current) {
                setIsSearching(false);
            }
        }
    };

    const handleBlur = () => {
        if (value) {
            setDisplayValue(formatRut(value));
        }
    };

    return (
        <div>
            <label className="label">RUT</label>
            <div className="relative">
                <input
                    type="text"
                    className={`input pr-10 ${error ? 'border-danger-500' : found ? 'border-success-500' : ''}`}
                    value={displayValue}
                    onChange={(e) => handleChange(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="12.345.678-9"
                    disabled={disabled}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isSearching ? (
                        <svg className="animate-spin h-4 w-4 text-slate-400" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    ) : found ? (
                        <Icon name="check-circle" size={18} className="text-success-500" />
                    ) : error ? (
                        <Icon name="x" size={18} className="text-danger-500" />
                    ) : (
                        <Icon name="search" size={18} className="text-slate-400" />
                    )}
                </div>
            </div>
            {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
            {found && <p className="mt-1 text-xs text-success-600">Datos cargados desde Personal</p>}
        </div>
    );
};
