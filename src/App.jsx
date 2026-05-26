import { useEffect, useState } from 'react';
import { useApp } from './context/AppContext';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import ToastStack from './components/Toast';
import SetupModal from './components/modals/SetupModal';
import TimerTab from './components/tabs/Timer';
import WorkTab from './components/tabs/Work';
import StatisticsTab from './components/tabs/Statistics';
import SettingsTab from './components/tabs/Settings';
import OrgTab from './components/tabs/OrgTab';

const TOP_BAR_H = 56;
const BOTTOM_NAV_H = 60 + 34;

export default function App() {
  const { isLoadingSettings, settings, setSettings, activeTab } = useApp();
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!isLoadingSettings && settings === null) setShowSetup(true);
    else setShowSetup(false);
  }, [isLoadingSettings, settings]);

  if (isLoadingSettings) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <div className="absolute inset-0 rounded-full blur-md opacity-40" style={{ background: 'var(--brand)' }} />
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  const handleSetupComplete = (config) => {
    setSettings(config);
    setShowSetup(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <TopBar />
      <ToastStack />

      <main
        className="flex-1 overflow-hidden"
        style={{
          marginTop: TOP_BAR_H,
          marginBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="h-full">
          {activeTab === 'timer'    && <TimerTab />}
          {activeTab === 'work'     && <WorkTab />}
          {activeTab === 'stats'    && <StatisticsTab />}
          {activeTab === 'team'     && <OrgTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>

      <BottomNav />

      {showSetup && <SetupModal onComplete={handleSetupComplete} />}
    </div>
  );
}
