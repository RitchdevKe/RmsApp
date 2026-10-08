// @ts-nocheck
import React, { useState, useRef, useEffect, useMemo } from 'react';

export interface SearchableSelectOption {
    value: string;
    label: string;
    sub?: string;
}

interface Props {
    value: string;
    onChange: (value: string) => void;
    options: SearchableSelectOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** Alphabetically sort by label (default true). */
    sort?: boolean;
}

/**
 * Lightweight searchable select. Options are sorted alphabetically by label
 * by default. Click the field to open a dropdown with a search input that
 * filters options on the fly.
 */
const SearchableSelect: React.FC<Props> = ({
    value,
    onChange,
    options,
    placeholder = 'Select…',
    disabled = false,
    className = '',
    sort = true,
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const sorted = useMemo(() => {
        const copy = [...options];
        if (sort) {
            copy.sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' }));
        }
        return copy;
    }, [options, sort]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return sorted;
        return sorted.filter(o =>
            String(o.label || '').toLowerCase().includes(q) ||
            String(o.sub || '').toLowerCase().includes(q),
        );
    }, [sorted, query]);

    const selected = options.find(o => o.value === value);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);

    return (
        <div ref={wrapRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(o => !o)}
                className={`w-full p-2 border rounded bg-white text-left flex items-center justify-between gap-2 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
                <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}>
                    {selected ? selected.label : placeholder}
                </span>
                <span className="text-gray-400 text-xs">▾</span>
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-64 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search…"
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
                        ) : (
                            filtered.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setOpen(false);
                                        setQuery('');
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${opt.value === value ? 'bg-primary/10 text-primary font-medium' : 'text-gray-800'}`}
                                >
                                    <div className="truncate">{opt.label}</div>
                                    {opt.sub && <div className="text-[11px] text-gray-500 truncate">{opt.sub}</div>}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
