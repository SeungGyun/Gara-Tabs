import { useState } from 'react';
import { useSettingsStore } from '../../shared/store/settingsStore';
import { TAB_GROUP_COLORS, type SubdomainMode, type ChromeTabGroupColor } from '../../shared/types';
import { COLOR_MAP } from '../../shared/utils/colors';
import { t, SUPPORTED_LANGUAGES } from '../../shared/i18n';

export default function SettingsPanel() {
  const { settings, updateSettings, addCustomRule, removeCustomRule } =
    useSettingsStore();
  const [newHostname, setNewHostname] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

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
      {/* 언어 설정 */}
      <div>
        <label className="text-sm font-medium block mb-2">{t('languageSetting')}</label>
        <select
          value={settings.language ?? 'auto'}
          onChange={(e) => updateSettings({ language: e.target.value })}
          className="input text-sm w-full"
        >
          {SUPPORTED_LANGUAGES.map(({ code, label }) => (
            <option key={code} value={code}>
              {code === 'auto' ? `${t('languageAuto')} — ${label}` : label}
            </option>
          ))}
        </select>
        {(settings.language ?? 'auto') === 'auto' && (
          <p className="text-xs text-gray-400 mt-1">{t('languageAutoDesc')}</p>
        )}
      </div>

      {/* 서브도메인 모드 */}
      <div>
        <label className="text-sm font-medium block mb-2">{t('subdomainHandling')}</label>
        <div className="space-y-1">
          {([
            ['merge', t('modeMerge')],
            ['split', t('modeSplit')],
            ['custom', t('modeCustom')],
          ] as const).map(([mode, desc]) => (
            <label key={mode} className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="radio"
                name="subdomainMode"
                checked={settings.subdomainMode === mode}
                onChange={() => handleModeChange(mode as SubdomainMode)}
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
          <label className="text-sm font-medium">{t('autoGrouping')}</label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoGroupEnabled}
              onChange={(e) => updateSettings({ autoGroupEnabled: e.target.checked })}
            />
            <span className="text-xs">{settings.autoGroupEnabled ? t('on') : t('off')}</span>
          </label>
        </div>

        {settings.autoGroupEnabled && (
          <div className="space-y-2">
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

            <div className="space-y-1.5 p-2 border rounded bg-white dark:bg-gray-800">
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder={t('urlPatternPlaceholder')}
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  className="input flex-1 text-xs"
                />
                <input
                  type="text"
                  placeholder={t('groupName')}
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="input w-20 text-xs"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 mr-1">{t('colorLabel')}</span>
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
                  {t('add')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 커스텀 도메인 규칙 */}
      <div>
        <label className="text-sm font-medium block mb-2">{t('customDomainRules')}</label>
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
            placeholder={t('hostname')}
            value={newHostname}
            onChange={(e) => setNewHostname(e.target.value)}
            className="input flex-1 text-xs"
          />
          <input
            type="text"
            placeholder={t('groupName')}
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="input w-20 text-xs"
          />
          <button onClick={handleAddRule} className="btn-secondary text-xs">
            {t('add')}
          </button>
        </div>
      </div>

      {/* 제외 패턴 */}
      <div>
        <label className="text-sm font-medium block mb-2">{t('excludePatterns')}</label>
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
