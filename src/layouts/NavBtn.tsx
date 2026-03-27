import type { ReactNode } from "react";

interface NavBtnProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function NavBtn({ icon, label, active, disabled, onClick }: NavBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={
        active
          ? { background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent-text)" }
          : { color: "var(--text-muted)" }
      }
      className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-all ${
        disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
      }`}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-base)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
        }
      }}
    >
      {icon}
    </button>
  );
}
