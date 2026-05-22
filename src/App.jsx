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

const TOP_BAR_H = 52;
const BOTTOM_NAV_H = 56 + 34; // nav + approx safe area

export default function App() {
  const { isLoadingSettings, settings, setSettings, activeTab } = useApp();
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!isLoadingSettings && settings === null) {
      setShowSetup(true);
    } else {
      setShowSetup(false);
    }
  }, [isLoadingSettings, settings]);

  if (isLoadingSettings) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <p className="text-zinc-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  const handleSetupComplete = (config) => {
    setSettings(config);
    setShowSetup(false);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      <TopBar />
      <ToastStack />

      {/* Main content area */}
      <main
        className="flex-1 overflow-hidden"
        style={{
          marginTop: TOP_BAR_H,
          marginBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          // Extra top padding from safe-area applied via paddingTop in CSS
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="h-full">
          {activeTab === 'timer' && <TimerTab />}
          {activeTab === 'work' && <WorkTab />}
          {activeTab === 'stats' && <StatisticsTab />}
          {activeTab === 'team' && <OrgTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>

      <BottomNav />

      {showSetup && <SetupModal onComplete={handleSetupComplete} />}
    </div>
  );
}
