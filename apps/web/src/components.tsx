import type { ReactNode } from "react";

export function Status({ status }: { status: string }) {
  return <span className={`status status-${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>;
}

export function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <article className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
