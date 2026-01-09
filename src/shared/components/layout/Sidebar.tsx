import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, IconName } from '../common/Icon';

interface Props {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

interface NavItem {
  label: string;
  to: string;
  icon: IconName;
}

interface NavSection {
  label: string;
  icon: IconName;
  items: NavItem[];
}

const NAVIGATION: NavSection[] = [
  {
    label: 'Operación',
    icon: 'building',
    items: [
      { label: 'Personal', to: '/personal', icon: 'users' },
      { label: 'Reuniones', to: '/reuniones', icon: 'calendar' },
      { label: 'Tareas', to: '/tareas', icon: 'clipboard' },
      // { label: 'Informativos', to: '/informativos', icon: 'megaphone' },
      { label: 'Asistencia', to: '/asistencia', icon: 'clock' },
      // { label: 'Mi Info', to: '/mi-info', icon: 'user' },
      { label: 'Credenciales', to: '/credenciales', icon: 'key' },
      // { label: 'Solicitudes', to: '/solicitudes', icon: 'inbox' },
      { label: 'Amonestaciones', to: '/amonestaciones', icon: 'alert-triangle' },
      { label: 'SRL', to: '/srl', icon: 'wrench' },
    ],
  },
  {
    label: 'Aseo',
    icon: 'sparkles',
    items: [
      { icon: 'trash', label: 'Aseo Admin', to: '/aseo/admin' },
      // { icon: 'alert-triangle', label: 'Amonestaciones', to: '/amonestaciones' },
      { label: 'Portal Móvil', to: '/aseo', icon: 'sparkles' },
    ],
  },
  {
    label: 'Insumos',
    icon: 'package',
    items: [
      { label: 'Solicitudes', to: '/insumos', icon: 'file-text' },
    ],
  },
  {
    label: 'MiniCheck',
    icon: 'clipboard',
    items: [
      { label: 'Odómetro', to: '/minicheck/odometro', icon: 'gauge' },
      { label: 'Publicidad', to: '/minicheck/publicidad', icon: 'image' },
    ],
  },
  {
    label: 'Flota',
    icon: 'truck',
    items: [
      { label: 'Estado de Flota', to: '/estado-flota', icon: 'truck' },
      { label: 'Fiscalización ICA', to: '/fiscalizacion-ica', icon: 'clipboard' },
    ],
  },
];

export const Sidebar = ({ isOpen, isCollapsed, onClose, onToggleCollapse }: Props) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(() => {
    // Expand section that contains current route
    const currentSection = NAVIGATION.find((section) =>
      section.items.some((item) => location.pathname.startsWith(item.to))
    );
    return currentSection ? [currentSection.label] : ['Operación'];
  });

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const isSectionActive = (section: NavSection) =>
    section.items.some((item) => location.pathname.startsWith(item.to));

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`${isOpen ? 'fixed' : 'hidden'} inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={`${isOpen ? 'translate-x-0' : '-translate-x-full'
          } fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-out md:translate-x-0 ${isCollapsed ? 'md:w-20' : 'md:w-72'
          } w-72`}
      >
        <div className="flex h-full flex-col bg-gradient-to-b from-dark-800 to-dark-900">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand">
              <span className="text-lg font-bold text-white">A</span>
            </div>
            {!isCollapsed && (
              <div className="flex flex-col flex-1">
                <span className="text-sm font-bold text-white">Asiss</span>
                <span className="text-xs text-slate-400">Dashboard Logística</span>
              </div>
            )}
            {/* Toggle Button - Desktop: collapse, Mobile: close */}
            <button
              onClick={() => {
                // On mobile: close sidebar
                // On desktop: toggle collapse
                if (window.innerWidth < 768) {
                  onClose();
                } else {
                  onToggleCollapse();
                }
              }}
              className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
            >
              <Icon name={isCollapsed ? "chevron-right" : "chevron-left"} size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 space-y-1">
            {NAVIGATION.map((section) => {
              const isExpanded = expandedSections.includes(section.label);
              const isActive = isSectionActive(section);

              return (
                <div key={section.label} className="mb-1">
                  {/* Section Header */}
                  <button
                    onClick={() => toggleSection(section.label)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${isActive
                        ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-brand'
                        : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-slate-200'
                        }`}
                    >
                      <Icon name={section.icon} size={18} />
                    </div>
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-left text-sm font-semibold">{section.label}</span>
                        <Icon
                          name="chevron-down"
                          size={16}
                          className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        />
                      </>
                    )}
                  </button>

                  {/* Section Items */}
                  {!isCollapsed && (
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                        }`}
                    >
                      <div className="mt-1 ml-4 pl-4 border-l border-white/10 space-y-0.5">
                        {section.items.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={onClose}
                            className={({ isActive }) =>
                              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isActive
                                ? 'bg-brand-500/20 text-brand-300 font-medium'
                                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                              }`
                            }
                          >
                            <Icon name={item.icon} size={16} />
                            <span>{item.label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-white/10 px-4 py-4">
            <div className="flex items-center gap-3 px-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-white text-sm font-bold">
                S
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">Supervisor</p>
                  <p className="text-xs text-slate-400">Terminal Activo</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
