import type { EgressMode } from "@harakiri/shared";
import { Icon } from "./icon";

export const egressModeMeta: Record<EgressMode, {
  label: string;
  detail: string;
  icon: string;
  tone: "open" | "restricted" | "blocked" | "custom";
}> = {
  open: {
    label: "Internet",
    detail: "Any public domain",
    icon: "globe",
    tone: "open"
  },
  restricted: {
    label: "Selected destinations",
    detail: "Presets and added domains",
    icon: "check",
    tone: "restricted"
  },
  blocked: {
    label: "No outbound",
    detail: "Deny every request",
    icon: "stop",
    tone: "blocked"
  },
  custom: {
    label: "Custom policy",
    detail: "Advanced allow and deny rules",
    icon: "settings",
    tone: "custom"
  }
};

const egressModeOrder: EgressMode[] = ["open", "restricted", "blocked", "custom"];

export const EgressModePicker = ({
  value,
  onChange,
  disabled = false,
  compact = false
}: {
  value?: EgressMode | null;
  onChange: (mode: EgressMode) => void;
  disabled?: boolean;
  compact?: boolean;
}) => (
  <div className={`egress-mode-picker ${compact ? "compact" : ""}`} role="radiogroup" aria-label="Outbound access mode">
    {egressModeOrder.map((mode) => {
      const meta = egressModeMeta[mode];
      const active = value === mode;
      return (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={active}
          className={`egress-mode-option ${active ? "active" : ""} mode-${meta.tone}`}
          disabled={disabled}
          onClick={() => onChange(mode)}
        >
          <span className="mode-top">
            <span className="mode-icon"><Icon name={meta.icon} size={13} /></span>
          </span>
          <span className="mode-title">{meta.label}</span>
          <span className="mode-detail">{meta.detail}</span>
        </button>
      );
    })}
  </div>
);
