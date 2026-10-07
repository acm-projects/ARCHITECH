import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

const ICON_PATHS = {
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  play: <path d="m8 5 11 7-11 7Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 15.3A9 9 0 1 1 8.7 4 7 7 0 0 0 20 15.3Z" />,
  undo: <><path d="M9 7 4 12l5 5" /><path d="M4 12h9a7 7 0 0 1 7 7" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
  sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="11" cy="18" r="2" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 15v5h14v-5" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  minus: <path d="M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7Z" />,
  brain: <><path d="M9 4a3 3 0 0 0-5 2 3 3 0 0 0 0 5 3 3 0 0 0 2 5.8V20h4V5a3 3 0 0 0-1-1ZM15 4a3 3 0 0 1 5 2 3 3 0 0 1 0 5 3 3 0 0 1-2 5.8V20h-4V5a3 3 0 0 1 1-1Z" /></>,
  connect: <><circle cx="6" cy="12" r="3" /><circle cx="18" cy="12" r="3" /><path d="M9 12h6" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  git: <><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9M12 12v3" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeoff: <><path d="m3 3 18 18" /><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.1 3.8M6.3 6.3C3.5 8.2 2 12 2 12s3.5 6 10 6c1 0 2-.1 2.9-.4" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  command: <><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V5" /></>,
  spark: <><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
  client: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  balance: <><path d="M12 4v5M5 20v-4M19 20v-4" /><path d="M5 16c0-3 2-5 7-5s7 2 7 5" /><circle cx="12" cy="4" r="2" /></>,
  gateway: <><path d="M8 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M8 12h8m-3-3 3 3-3 3" /></>,
  server: <><rect x="4" y="4" width="16" height="5" rx="1" /><rect x="4" y="10" width="16" height="5" rx="1" /><rect x="4" y="16" width="16" height="4" rx="1" /><path d="M7 6.5h.01M7 12.5h.01M7 18h.01" /></>,
  cache: <><path d="m12 3-8 4 8 4 8-4-8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></>,
  queue: <><circle cx="5" cy="7" r="2" /><circle cx="5" cy="17" r="2" /><path d="M9 7h10M9 17h10M16 4l3 3-3 3M16 14l3 3-3 3" /></>,
  database: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  storage: <><path d="M4 7h16v12H4zM7 7V4h10v3" /><path d="M8 11h8M8 15h5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.5 4 5.5 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.5-4-9s1.4-6.5 4-9Z" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICON_PATHS;
export type ButtonVariant = "primary" | "outline" | "soft" | "ghost" | "run" | "danger";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export type ArchieVariant = "plain" | "beginner" | "intermediate" | "advanced";

export function ArchieMark({
  variant = "plain",
  size = 32,
  className = "",
}: {
  variant?: ArchieVariant;
  size?: number;
  className?: string;
}) {
  const hasHat = variant !== "plain";

  return (
    <svg
      className={`archie-mark ${className}`.trim()}
      viewBox={hasHat ? "0 -42 197 226" : "0 0 197 184"}
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path fill="currentColor" fillRule="evenodd" d="M82 76 L83 81 L86 84 L93 87 L105 86 L109 84 L113 79 L113 76 L111 74 L107 74 L104 77 L98 79 L93 78 L87 74 L84 74Z M62 57 L57 63 L58 69 L62 73 L65 74 L70 73 L74 69 L75 66 L74 61 L70 57Z M130 56 L124 58 L121 61 L120 64 L121 69 L125 73 L128 74 L133 73 L137 69 L138 65 L137 61 L133 57Z M53 15 L41 27 L32 42 L25 61 L18 98 L16 128 L15 129 L14 156 L7 159 L2 163 L0 167 L0 174 L2 177 L7 181 L16 183 L56 183 L66 180 L71 176 L75 168 L76 140 L78 133 L89 122 L103 121 L111 125 L117 134 L119 141 L120 169 L123 175 L130 181 L137 183 L178 183 L179 182 L185 182 L191 179 L195 173 L194 165 L190 160 L181 156 L178 106 L177 105 L177 98 L176 97 L176 91 L175 90 L172 69 L165 47 L153 26 L142 15 L133 9 L116 2 L106 1 L105 0 L91 0 L76 3 L62 9Z M64 26 L83 17 L108 16 L116 18 L128 24 L144 40 L154 61 L161 93 L163 116 L164 117 L164 130 L165 131 L165 166 L164 167 L138 167 L135 164 L134 140 L133 139 L133 134 L128 122 L117 111 L105 106 L90 106 L81 109 L69 119 L63 130 L61 138 L61 147 L60 148 L60 164 L57 167 L31 167 L30 166 L31 119 L32 118 L32 108 L33 107 L35 86 L39 71 L39 67 L45 50 L50 41Z" />

      {variant === "beginner" && (
        <g className="archie-hat" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round">
          <path d="M42 -1c15-17 36-25 62-25 24 0 44 7 59 20" />
          <path d="M43 -1c31-4 60 0 88 10" />
          <path d="M130 8c15 0 27 4 36 10" />
        </g>
      )}

      {variant === "intermediate" && (
        <g className="archie-hat" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
          <path d="M43 3c4-23 24-39 55-39 30 0 51 16 55 39" />
          <path d="M31 7h135" />
          <path d="M82-31V1M115-31V1" />
        </g>
      )}

      {variant === "advanced" && (
        <g className="archie-hat" fill="currentColor">
          <path d="M28-16 98-42l71 26-71 28-70-28Z" />
          <path d="M157-13h9v31h-9Z" />
          <circle cx="161.5" cy="22" r="8" />
        </g>
      )}
    </svg>
  );
}

export function Logo({
  className = "",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`logo ${className}`.trim()}
      aria-label="ARCHITECT"
      {...buttonProps}
    >
      <svg
        className="brand-wordmark"
        viewBox="0 0 1402 188"
        role="img"
        aria-label="ARCHITECT"
      >
        <path fill="currentColor" fillRule="evenodd" d="M82 76 L83 81 L86 84 L93 87 L105 86 L109 84 L113 79 L113 76 L111 74 L107 74 L104 77 L98 79 L93 78 L87 74 L84 74Z M62 57 L57 63 L58 69 L62 73 L70 73 L74 69 L74 61 L70 57Z M130 56 L124 58 L120 64 L121 69 L128 74 L133 73 L137 69 L138 65 L137 61Z M725 18 L725 183 L762 183 L762 18Z M547 18 L547 183 L584 183 L584 124 L586 117 L657 117 L658 182 L695 183 L696 19 L658 18 L657 84 L586 84 L584 82 L584 18Z M205 18 L204 181 L241 182 L241 131 L268 130 L304 182 L347 182 L348 179 L309 129 L310 127 L318 125 L330 118 L342 104 L347 92 L349 82 L348 62 L346 54 L335 36 L327 29 L316 23 L296 18Z M241 49 L290 48 L299 51 L307 58 L312 69 L312 81 L308 91 L301 98 L289 102 L242 102Z M1260 17 L1260 48 L1311 49 L1311 183 L1347 183 L1347 49 L1400 48 L1401 18Z M942 17 L941 182 L1066 183 L1066 153 L978 152 L979 117 L1054 117 L1054 85 L979 85 L978 49 L1066 48 L1067 18Z M782 17 L782 48 L833 49 L832 182 L868 183 L869 49 L922 48 L922 17Z M1155 15 L1136 20 L1123 26 L1105 39 L1096 49 L1089 59 L1081 77 L1078 90 L1078 114 L1082 130 L1089 145 L1096 155 L1112 170 L1125 178 L1149 186 L1183 187 L1208 180 L1221 173 L1242 154 L1249 143 L1215 130 L1202 144 L1192 150 L1179 154 L1159 154 L1148 151 L1138 146 L1125 134 L1116 116 L1115 95 L1121 76 L1129 65 L1141 55 L1149 51 L1165 47 L1181 48 L1197 54 L1211 66 L1217 75 L1250 60 L1242 47 L1232 36 L1220 27 L1208 21 L1188 15Z M437 15 L415 21 L403 27 L390 36 L376 51 L367 66 L361 83 L359 101 L361 121 L365 134 L373 149 L386 164 L401 175 L416 182 L437 187 L463 187 L474 185 L489 180 L505 171 L518 160 L528 147 L529 143 L511 135 L495 130 L490 137 L481 145 L464 153 L447 155 L427 150 L417 144 L406 133 L399 120 L396 98 L401 79 L407 69 L418 58 L430 51 L440 48 L454 47 L471 51 L483 58 L493 68 L497 75 L529 61 L530 59 L521 45 L510 34 L491 22 L467 15Z M53 15 L37 33 L32 42 L25 61 L18 98 L14 156 L2 163 L0 167 L0 174 L7 181 L16 183 L56 183 L66 180 L71 176 L75 168 L76 140 L78 133 L89 122 L103 121 L111 125 L117 134 L119 141 L120 169 L123 175 L130 181 L137 183 L178 183 L185 182 L191 179 L195 173 L194 165 L190 160 L181 156 L178 106 L172 69 L165 47 L153 26 L142 15 L133 9 L116 2 L105 0 L91 0 L76 3 L62 9Z M64 26 L83 17 L108 16 L116 18 L128 24 L144 40 L154 61 L161 93 L165 131 L164 167 L138 167 L135 164 L134 140 L128 122 L117 111 L105 106 L90 106 L81 109 L69 119 L63 130 L60 148 L60 164 L57 167 L30 166 L31 119 L35 86 L39 67 L45 50 L50 41Z" />
      </svg>
    </button>
  );
}

export type ButtonSize = "sm" | "md" | "lg";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  size?: ButtonSize;
  selected?: boolean;
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  icon,
  size = "lg",
  selected,
  loading = false,
  className = "",
  type = "button",
  disabled,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("ui-control", "btn", `btn-${variant}`, `ui-size-${size}`, selected && "is-selected", className)}
      aria-pressed={selected}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...buttonProps}
    >
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      {!loading && icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  variant?: "ghost" | "outline" | "danger";
  size?: ButtonSize;
  selected?: boolean;
  tooltip?: string;
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  selected,
  tooltip,
  className = "",
  title,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  const hint = tooltip ?? title ?? label;
  return (
    <button
      type={type}
      className={cx("ui-control", "ui-icon-button", `ui-icon-button-${variant}`, `ui-size-${size}`, selected && "is-selected", className)}
      aria-label={label}
      aria-pressed={selected}
      title={title ?? hint}
      data-tooltip={hint}
      {...buttonProps}
    >
      <Icon name={icon} size={size === "sm" ? 14 : size === "lg" ? 19 : 16} />
    </button>
  );
}

export function SegmentedControl({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("ui-segmented", className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function SegmentedControlItem({
  selected,
  className = "",
  children,
  type = "button",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type={type}
      className={cx("ui-control", "ui-segmented-item", selected && "is-selected", className)}
      aria-pressed={selected}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

export function Tabs({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("ui-tabs", className)} role="tablist" aria-label={label}>
      {children}
    </div>
  );
}

export function Tab({
  selected,
  className = "",
  children,
  type = "button",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type={type}
      className={cx("ui-control", "ui-tab", selected && "is-selected", className)}
      role="tab"
      aria-selected={selected}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

export function TextInput({
  className = "",
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("ui-input", className)} {...inputProps} />;
}

export function SelectInput({
  className = "",
  ...selectProps
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("ui-input", "ui-select", className)} {...selectProps} />;
}

export function Field({
  label,
  meta,
  className = "",
  children,
  ...labelProps
}: LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <label className={cx("ui-field", className)} {...labelProps}>
      <span className="ui-field-label">
        <span>{label}</span>
        {meta && <small>{meta}</small>}
      </span>
      {children}
    </label>
  );
}

export function Dialog({
  label,
  className = "",
  scrimClassName = "",
  children,
  onDismiss,
}: {
  label: string;
  className?: string;
  scrimClassName?: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className={cx("ui-dialog-scrim", scrimClassName)}
      onMouseDown={onDismiss}
    >
      <div
        className={cx("ui-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  className = "",
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("ui-panel-header", className)}>
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {children && <div className="ui-panel-header-actions">{children}</div>}
    </div>
  );
}

export function Menu({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ui-menu", className)} role="menu" {...props}>
      {children}
    </div>
  );
}

export function MenuItem({
  destructive = false,
  className = "",
  children,
  type = "button",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type={type}
      role="menuitem"
      className={cx("ui-control", "ui-menu-item", destructive && "is-destructive", className)}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

export function Choice({
  selected = false,
  className = "",
  children,
  type = "button",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type={type}
      className={cx("ui-control", "ui-choice", selected && "is-selected", className)}
      aria-pressed={selected}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  className = "",
  children,
  type = "button",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { checked: boolean }) {
  return (
    <button
      type={type}
      className={cx("ui-control", "ui-toggle", checked && "is-selected", className)}
      aria-pressed={checked}
      {...buttonProps}
    >
      <span className="ui-toggle-track" aria-hidden="true"><i /></span>
      <span>{children ?? (checked ? "On" : "Off")}</span>
    </button>
  );
}

export function StatusMessage({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: "neutral" | "success" | "error";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("ui-status", `ui-status-${tone}`, className)} role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function EmptyState({
  className = "",
  title,
  children,
}: {
  className?: string;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cx("ui-empty-state", className)} role="status">
      {title && <b>{title}</b>}
      <div>{children}</div>
    </div>
  );
}
