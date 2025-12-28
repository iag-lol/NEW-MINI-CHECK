import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { InspectorSidebar } from '../../shared/components/layout/InspectorSidebar';
import { AppHeader } from '../../shared/components/layout/AppHeader';

export const InspectorLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
            <div className="flex">
                {/* Inspector Sidebar */}
                <InspectorSidebar
                    isOpen={sidebarOpen}
                    isCollapsed={sidebarCollapsed}
                    onClose={() => setSidebarOpen(false)}
                    onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                />

                {/* Main Content */}
                <div className={`flex min-h-screen flex-1 flex-col transition-all duration-300 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-72'}`}>
                    {/* Header */}
                    <AppHeader onMenuToggle={() => setSidebarOpen((prev) => !prev)} />

                    {/* Page Content */}
                    <main className="flex-1 px-4 pb-8 pt-6 md:px-8">
                        <div className="animate-fade-in">
                            <Outlet />
                        </div>
                    </main>

                    {/* Footer */}
                    <footer className="border-t border-slate-200 bg-white/50 px-4 py-4 md:px-8">
                        <div className="flex flex-col items-center justify-between gap-2 text-xs text-slate-500 sm:flex-row">
                            <p>© 2024 Asiss · Vista Inspector</p>
                            <p className="flex items-center gap-1">
                                <span className="inline-block h-2 w-2 rounded-full bg-success-500 animate-pulse"></span>
                                Sistema operativo
                            </p>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
};
