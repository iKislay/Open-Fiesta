"use client";
import { useMemo } from 'react';
import { MODEL_CATALOG } from '@/lib/models';
import { AiModel } from '@/lib/types';

export default function ModelSelector({
  selectedIds,
  onToggle,
  max = 5,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  max?: number;
}) {
  const disabledIds = useMemo(() => {
    if (selectedIds.length < max) return new Set<string>();
    return new Set<string>(MODEL_CATALOG.filter(m => !selectedIds.includes(m.id)).map(m => m.id));
  }, [selectedIds, max]);

  return (
    <div className="flex flex-wrap gap-2">
      {MODEL_CATALOG.map((m: AiModel) => {
        const selected = selectedIds.includes(m.id);
        const disabled = disabledIds.has(m.id);
        return (
          <button
            key={m.id}
            onClick={() => onToggle(m.id)}
            disabled={!selected && disabled}
            className={`px-3 py-1.5 rounded-md border text-sm tracking-tight ${selected ? 'bg-[#e42a42] border-[#d0253b] text-white shadow-[0_0_0_1px_rgba(228,42,66,0.4)_inset]' : 'bg-white/10 border-white/15 text-white'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
            title={disabled ? `Max ${max} models at once` : ''}
          >
            {selected ? '✓ ' : ''}{m.label}
          </button>
        );
      })}
    </div>
  );
}
