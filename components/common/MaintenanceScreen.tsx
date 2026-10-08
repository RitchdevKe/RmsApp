import React from 'react';
import Icon from '../Icon';

/**
 * Host that shows the maintenance banner when the toggle is enabled.
 * Preview / dev / lovable hosts remain unaffected so admins can still
 * work on the app while the published site is locked.
 */
export const MAINTENANCE_HOST = 'app.task-me.ke';

export const isMaintenanceHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === MAINTENANCE_HOST;
};

export const shouldShowMaintenance = (enabled: boolean | undefined): boolean =>
  Boolean(enabled) && isMaintenanceHost();

export const MaintenanceScreen: React.FC = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-6">
    <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-4 border-amber-500 overflow-hidden">
      <div className="bg-amber-50 p-6 text-center border-b border-amber-100 flex flex-col items-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3">
          <Icon name="shield" className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-amber-700">Under Maintenance</h2>
      </div>
      <div className="p-8 text-center space-y-3">
        <p className="text-gray-700 font-medium text-base">
          This app is undergoing maintenance. Try again in a few minutes.
        </p>
        <p className="text-gray-500 text-sm italic">
          Sorry for the inconveniences.
        </p>
      </div>
    </div>
  </div>
);

export default MaintenanceScreen;
