import { useState } from 'react';
import { useSettingsStore } from '../../shared/store/settingsStore';
import { TAB_GROUP_COLORS, type SubdomainMode, type ChromeTabGroupColor } from '../../shared/types';
import { COLOR_MAP } from '../../shared/utils/colors';

export default function SettingsPanel() {
  const { settings, updateSettings, addCustomRule, removeCustomRule } =
    useSettingsStore();
  const [newHostname, setNewHostname] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  // 자동 그룹화 규칙 추가 폼
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleColor, setNewRuleColor] = useState<ChromeTabGroupColor>('blue');

  const handleModeChange = (mode: SubdomainMode) => {
    updateSettings({ subdomainMode: mode });
  };

  const handleAddRule = () => {
    if (!newHostname.trim() || !newGroupName.trim()) return;
    addCustomRule(newHostname.trim(), newGroupName.trim());
    setNewHostname('');
    setNewGroupName('');
  };

  const handleAddAutoRule = () => {
    if (!newRulePattern.trim() || !newRuleName.trim()) return;
    const rule = {
      id: crypto.randomUUID(),
      pattern: newRulePattern.trim(),
      groupName: newRuleName.trim(),
      color: newRuleColor,
      enabled: true,
    };
    updateSettings({
      autoGroupRules: [...settings.autoGroupRules, rule],
    });
    setNewRulePattern('');
    setNewRuleName('');
    setNewRuleColor('blue');
  };

  const handleRemoveAutoRule = (id: string) => {
    updateSettings({
      autoGroupRules: settings.autoGroupRules.filter((r) => r.id !== id),
    });
  };

  const handleToggleAutoRule = (id: string) => {
    updateSettings({
      autoGroupRules: settings.autoGroupRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r,
      ),
    });
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

      {/* 자동 그룹화 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">자동 그룹화</label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoGroupEnabled}
              onChange={(e) => updateSettings({ autoGroupEnabled: e.target.checked })}
            />
            <span className="text-xs">{settings.autoGroupEnabled ? '켜짐' : '꺼짐'}</span>
          </label>
        </div>

        {settings.autoGroupEnabled && (
          <div className="space-y-2">
            {/* 기존 규칙 목록 */}
            {settings.autoGroupRules.length > 0 && (
              <div className="space-y-1">
                {settings.autoGroupRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-1.5 text-xs rounded px-2 py-1.5 ${
                      rule.enabled ? 'bg-gray-50 dark:bg-gray-700' : 'bg-gray-50/50 dark:bg-gray-700/50 opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggleAutoRule(rule.id)}
                    />
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLOR_MAP[rule.color] }}
                    />
                    <span className="truncate flex-1">
                      <code>{rule.pattern}</code> → <strong>{rule.groupName}</strong>
                    </span>
                    <button
                      onClick={() => handleRemoveAutoRule(rule.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 새 규칙 추가 폼 */}
            <div className="space-y-1.5 p-2 border rounded bg-white dark:bg-gray-800">
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="URL 패턴 (예: github.com)"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  className="input flex-1 text-xs"
                />
                <input
                  type="text"
                  placeholder="그룹명"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="input w-20 text-xs"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 mr-1">색상:</span>
                {TAB_GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewRuleColor(c)}
                    className={`w-4 h-4 rounded-full border ${
                      newRuleColor === c ? 'border-gray-900 dark:border-white scale-125' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: COLOR_MAP[c] }}
                  />
                ))}
                <button
                  onClick={handleAddAutoRule}
                  disabled={!newRulePattern.trim() || !newRuleName.trim()}
                  className="btn-primary text-xs ml-auto disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        )}
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
