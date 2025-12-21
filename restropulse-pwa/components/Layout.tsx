import React from 'react';
import { LayoutGrid, PenTool, Lightbulb, UserCog, PlusCircle } from 'lucide-react';
import { ViewState } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  setView: (view: ViewState) => void;
  title: string;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, setView, title }) => {
  
  const NavItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => setView(view)}
        className={`flex flex-col items-center justify-center w-full py-2 transition-colors ${
          isActive ? 'text-orange-600' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        <span className="text-[10px] mt-1 font-medium">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
           <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/20">
             <span className="text-white font-bold text-xl">R</span>
           </div>
           <div className="flex flex-col">
              <h1 className="font-extrabold text-base text-slate-800 leading-tight tracking-tight">RestroPulse</h1>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 no-scrollbar">
        {children}
      </main>

      {/* Sticky Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe pt-1 z-40">
        <div className="flex justify-around items-center px-2 pb-1">
          <NavItem view="DASHBOARD" icon={LayoutGrid} label="Dashboard" />
          <NavItem view="STUDIO" icon={PenTool} label="Studio" />
          
          {/* Central Action Button */}
          <div className="relative -top-5">
             <button 
                onClick={() => setView('INPUTS')}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                    currentView === 'INPUTS' ? 'bg-slate-800 text-white' : 'bg-orange-600 text-white'
                }`}
             >
                <PlusCircle size={28} />
             </button>
          </div>

          <NavItem view="STRATEGY" icon={Lightbulb} label="Strategy" />
          <NavItem view="SETTINGS" icon={UserCog} label="Settings" />
        </div>
      </nav>
    </div>
  );
};

export default Layout;