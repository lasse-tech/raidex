// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { ROLES, roleIconUrl } from '../lib/wow.js';

// Real WoW role icon; a block element so it centres vertically in flex rows.
export function RoleIcon({ role, size = 18, style }) {
  if (!ROLES[role]) return null;
  return (
    <img className="role-ic" src={roleIconUrl(role)} alt="" width={size} height={size}
      style={{ display: 'block', flexShrink: 0, ...style }} />
  );
}

export function RoleBadge({ role }) {
  const r = ROLES[role];
  if (!r) return null;
  return (
    <span className="role-badge" style={{ background: r.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <RoleIcon role={role} size={14} />{r.label}
    </span>
  );
}

export function RoleCounts({ counts }) {
  return (
    <div className="role-counts">
      {['tank', 'healer', 'dps'].map((role) => (
        <div key={role} className="role-count">
          <div className="n" style={{ color: ROLES[role].color }}>{counts?.[role] ?? 0}</div>
          <div className="r"><RoleIcon role={role} size={18} />{ROLES[role].label}</div>
        </div>
      ))}
    </div>
  );
}

export function StatTile({ label, value, accent }) {
  return (
    <div className="card stat">
      <div className="val" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}
