import React from 'react';
import './M3ChipRow.css';

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

interface M3ChipRowProps {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

/** Horizontally scrollable M3 filter-chip row (sticky-ready). */
export const M3ChipRow: React.FC<M3ChipRowProps> = ({ options, value, onChange, ariaLabel = 'Filters', className = '' }) => (
  <div className={`m3-chip-row ${className}`} role="tablist" aria-label={ariaLabel}>
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="tab"
        aria-selected={value === opt.value}
        className={`m3-chip ${value === opt.value ? 'm3-chip--active' : ''}`}
        onClick={() => onChange(opt.value)}
      >
        <span>{opt.label}</span>
        {typeof opt.count === 'number' && <span className="m3-chip-count m3-numeric">{opt.count}</span>}
      </button>
    ))}
  </div>
);

export default M3ChipRow;
