import type { ReactNode } from "react";
import type { AiModelsResponse } from "../lib/aiModels";

function shortModelName(label: string): string {
  return label
    .replace(/^Google\s+/i, "")
    .replace(/^Gemini\s+/i, "")
    .replace(/^Qwen\s+\d+(?:\.\d+)?\s+/i, "Qwen ");
}

export default function AiModelSelector({
  models,
  value,
  defaultModel,
  onChange,
  onSetDefault,
  disabled,
  compact = false,
  trailing,
}: {
  models: AiModelsResponse | null;
  value: string;
  defaultModel: string;
  onChange: (ref: string) => void;
  onSetDefault: () => void;
  disabled?: boolean;
  compact?: boolean;
  trailing?: ReactNode;
}) {
  if (!models) {
    return compact ? null : <p className="ai-selector__status">Loading models…</p>;
  }

  return (
    <div className={`ai-selector${compact ? " ai-selector--compact" : ""}`}>
      <label className="ai-selector__field">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label="AI model"
        >
          {models.providers.map((provider) => (
            <optgroup key={provider.id} label={provider.label}>
              {provider.models.map((model) => (
                <option key={`${provider.id}:${model.id}`} value={`${provider.id}:${model.id}`}>
                  {shortModelName(model.label)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="ai-selector__actions">
        <button
          type="button"
          className="ai-selector__default"
          onClick={onSetDefault}
          disabled={disabled || value === defaultModel}
          title={value === defaultModel ? "Default model" : "Set as default model"}
        >
          {value === defaultModel ? "Default" : "Set default"}
        </button>
        {trailing}
      </div>
    </div>
  );
}
