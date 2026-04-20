import { useState } from 'react';
import { Icon } from '../../../shared/components/common/Icon';
import { TERMINALS } from '../../../shared/utils/terminal';
import { TerminalCode } from '../../../shared/types/terminal';
import { useInspecciones } from '../hooks';

export const HistoryTab = () => {
    const [search, setSearch] = useState('');
    const [terminalFilter, setTerminalFilter] = useState('');

    const { data = [], isLoading, error } = useInspecciones({
        ppu: search || undefined,
        terminal_code: terminalFilter || undefined,
    });

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Icon
                        name="search"
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        type="text"
                        placeholder="Buscar por PPU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value.toUpperCase())}
                        className="input pl-9 font-mono uppercase"
                    />
                </div>
                <select
                    value={terminalFilter}
                    onChange={(e) => setTerminalFilter(e.target.value)}
                    className="input sm:w-56"
                >
                    <option value="">Todos los terminales</option>
                    {Object.entries(TERMINALS).map(([code, name]) => (
                        <option key={code} value={code}>
                            {name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Content */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Icon name="loader" size={24} className="animate-spin text-blue-600" />
                        <p className="text-sm text-slate-500">Cargando historial...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Icon name="alert-circle" size={28} className="text-red-400" />
                        <p className="text-sm text-red-600">Error al cargar el historial.</p>
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Icon name="clipboard" size={36} className="text-slate-300" />
                        <p className="text-sm text-slate-500">No hay registros para esta búsqueda.</p>
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        {['Fecha', 'PPU', 'Terminal', 'Fiscalizador', 'Score', 'Resultado'].map(
                                            (h) => (
                                                <th
                                                    key={h}
                                                    className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide"
                                                >
                                                    {h}
                                                </th>
                                            )
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-slate-50 transition-colors"
                                        >
                                            <td className="px-5 py-3.5 text-sm text-slate-600">
                                                {row.fecha}
                                            </td>
                                            <td className="px-5 py-3.5 text-sm font-bold font-mono text-slate-900">
                                                {row.ppu}
                                            </td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600">
                                                {TERMINALS[row.terminal_code as TerminalCode] ??
                                                    row.terminal_code}
                                            </td>
                                            <td className="px-5 py-3.5 text-sm text-slate-600">
                                                {row.fiscalizador}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span
                                                    className={`inline-flex items-center justify-center w-10 h-8 rounded-lg text-xs font-bold ${row.score === row.total
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-red-100 text-red-700'
                                                        }`}
                                                >
                                                    {row.score}/{row.total}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <ResultadoBadge resultado={row.resultado} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="sm:hidden divide-y divide-slate-100">
                            {data.map((row) => (
                                <div key={row.id} className="p-4">
                                    <div className="flex justify-between items-start mb-1.5">
                                        <span className="font-mono font-bold text-slate-900 text-base">
                                            {row.ppu}
                                        </span>
                                        <ResultadoBadge resultado={row.resultado} />
                                    </div>
                                    <div className="text-xs text-slate-500 space-y-0.5">
                                        <div>
                                            {row.fecha} ·{' '}
                                            {TERMINALS[row.terminal_code as TerminalCode] ??
                                                row.terminal_code}
                                        </div>
                                        <div>
                                            {row.fiscalizador} · Score: {row.score}/{row.total}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Record count */}
            {!isLoading && !error && data.length > 0 && (
                <p className="text-xs text-slate-400 text-right">
                    {data.length} registro{data.length !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
};

const ResultadoBadge = ({ resultado }: { resultado: 'CUMPLE' | 'NO_CUMPLE' }) => (
    <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${resultado === 'CUMPLE'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-red-50 text-red-700 border-red-200'
            }`}
    >
        {resultado === 'CUMPLE' ? (
            <Icon name="check-circle" size={11} />
        ) : (
            <Icon name="x-circle" size={11} />
        )}
        {resultado === 'CUMPLE' ? 'CUMPLE' : 'NO CUMPLE'}
    </span>
);
