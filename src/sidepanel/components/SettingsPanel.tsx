import { useState } from 'react';
import { useSettingsStore } from '../../shared/store/settingsStore';
import type { SubdomainMode } from '../../shared/types';

export default function SettingsPanel() {
  const { settings, updateSettings, addCustomRule, removeCustomRule } =
    useSettingsStore();
  const [newHostname, setNewHostname] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const handleModeChange = (mode: SubdomainMode) => {
    updateSettings({ subdomainMode: mode });
  };

  const handleAddRule = () => {
    if (!newHostname.trim() || !newGroupName.trim()) return;
    addCustomRule(newHostname.trim(), newGroupName.trim());
    setNewHostname('');
    setNewGroupName('');
  };

  return (
    <div className="p-3 space-y-4">
      {/* 서브도메인 모드 */}
      <div>
        <label className="text-sm font-medium block mb-2">서브도메인 처리</label>
        <div className="space-y-1">
          {([
            ['merge', '병합 (mail.google.com → google.com)'],
            ['split', '분리 (각 서브도메인 별도 그룹)'],
            ['custom', '커스텀 규칙 우선'],
          ] as const).map(([mode, desc]) => (
            <label key={mode} className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="radio"
                name="subdomainMode"
                checked={settings.subdomainMode === mode}
                onChange={() => handleModeChange(mode)}
                className="mt-0.5"
              />
              <span className="text-xs">{desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 커스텀 도메인 규칙 */}
      <div>
        <label className="text-sm font-medium block mb-2">커스텀 도메인 규칙</label>
        {Object.keys(settings.customDomainRules).length > 0 && (
          <div className="space-y-1 mb-2">
            {Object.entries(settings.customDomainRules).map(([host, group]) => (
              <div
                key={host}
                className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700 rounded px-2 py-1.5"
              >
                <span>
                  {host} → <strong>{group}</strong>
                </span>
                <button
                  onClick={() => removeCustomRule(host)}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="hostname"
            value={newHostname}
            onChange={(e) => setNewHostname(e.target.value)}
            className="input flex-1 text-xs"
          />
          <input
            type="text"
            placeholder="그룹명"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="input w-20 text-xs"
          />
          <button onClick={handleAddRule} className="btn-secondary text-xs">
            추가
          </button>
        </div>
      </div>

      {/* 제외 패턴 */}
      <div>
        <label className="text-sm font-medium block mb-2">제외 패턴</label>
        <div className="space-y-1">
          {settings.excludePatterns.map((pattern, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700 rounded px-2 py-1.5"
            >
              <code>{pattern}</code>
              <button
                onClick={() =>
                  updateSettings({
                    excludePatterns: settings.excludePatterns.filter(
                      (_, idx) => idx !== i,
                    ),
                  })
                }
                className="text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
