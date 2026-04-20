import { useState } from 'react';
import { Icon } from '../../shared/components/common/Icon';
import { FormTab } from './tabs/FormTab';
import { HistoryTab } from './tabs/HistoryTab';
import { ReportsTab } from './tabs/ReportsTab';

type Tab = 'form' | 'history' | 'reports';

const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { id: 'form', label: 'Nueva Inspección', icon: 'clipboard' },
    { id: 'history', label: 'Historial', icon: 'clock' },
    { id: 'reports', label: 'Reportes', icon: 'bar-chart' },
];

export const InspeccionICA = () => {
    const [activeTab, setActiveTab] = useState<Tab>('form');

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                        Fiscalización ICA
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Norma A18 · El interior del vehículo está limpio y libre de suciedad
                    </p>
                </div>

                {/* Tab navigation */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            <Icon name={tab.icon} size={14} />
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden">
                                {tab.id === 'form' ? 'Nueva' : tab.id === 'history' ? 'Historial' : 'Reportes'}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            {activeTab === 'form' && <FormTab />}
            {activeTab === 'history' && <HistoryTab />}
            {activeTab === 'reports' && <ReportsTab />}
        </div>
    );
};
