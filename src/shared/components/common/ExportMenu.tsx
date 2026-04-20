import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

interface Props {
  onExportView: () => void;
  onExportAll: () => void;
}

export const ExportMenu = ({ onExportView, onExportAll }: Props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="btn btn-secondary flex items-center gap-2"
      >
        <Icon name="layers" size={16} />
        <span>Exportar</span>
        <Icon
          name="chevron-down"
          size={13}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <button
            onClick={() => { onExportView(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Icon name="clipboard" size={15} className="text-slate-400" />
            Exportar Vista
          </button>
          <div className="border-t border-slate-100" />
          <button
            onClick={() => { onExportAll(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Icon name="layers" size={15} className="text-slate-400" />
            Exportar Todo
          </button>
        </div>
      )}
    </div>
  );
};
