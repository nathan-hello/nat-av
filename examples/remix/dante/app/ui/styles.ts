import { css } from "remix/ui";

export const colors = {
  border: "#d1d5db",
  grid: "#e5e7eb",
  header: "#f9fafb",
  muted: "#6b7280",
  accent: "#2563eb",
  routed: "#16a34a",
  unresolved: "#d97706",
};

export const panel = css({
  background: "#fff",
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  padding: "16px",
});

export const muted = css({
  margin: "2px 0 0",
  color: colors.muted,
  fontSize: "12px",
});

export const button = css({
  appearance: "none",
  background: "#fff",
  border: `1px solid ${colors.border}`,
  borderRadius: "6px",
  color: "#111827",
  cursor: "pointer",
  padding: "6px 12px",
  "&:hover:not(:disabled)": { background: colors.header },
  "&:disabled": { cursor: "not-allowed", opacity: 0.5 },
});

export const smallButton = css({
  padding: "2px 8px",
  fontSize: "12px",
});
