"use client";
import { useEffect, useId, useRef, useState } from "react";

// Dark or light badge text, whichever reads on the given colour.
export const ink = (c) =>
  parseInt(c.slice(1, 3), 16) * 0.299 +
    parseInt(c.slice(3, 5), 16) * 0.587 +
    parseInt(c.slice(5, 7), 16) * 0.114 >
  150
    ? "#2f2a3d"
    : "#fff";

// Searchable combobox (WAI-ARIA combobox + listbox pattern).
// options: [[value, label, badge?, color?]]; search matches label and badge.
export default function Search({ options, value, onChange }) {
  const id = useId();
  const input = useRef();
  const list = useRef();
  const [q, setQ] = useState(null); // null = closed
  const [hi, setHi] = useState(0); // highlighted row
  const open = q !== null;
  const label = options.find(([v]) => v === value)?.[1] ?? "";
  const shown = open
    ? options.filter(([, l, b]) => `${l} ${b ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : [];

  useEffect(() => {
    list.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const pick = (o) => {
    if (o) onChange(o[0]);
    setQ(null);
    input.current.blur();
  };

  const onKeyDown = (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step && shown.length) {
      e.preventDefault();
      setHi((h) => (h + step + shown.length) % shown.length);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      pick(shown[hi]);
    } else if (e.key === "Escape") pick();
  };

  return (
    <div className="combo">
      <input
        ref={input}
        className="big"
        role="combobox"
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[hi] ? `${id}-${hi}` : undefined}
        autoComplete="off"
        value={q ?? label}
        placeholder={label}
        onFocus={() => {
          setQ("");
          setHi(Math.max(0, options.findIndex(([v]) => v === value)));
        }}
        onBlur={() => setQ(null)}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        // mousedown would blur the input before the click lands.
        <ul className="combo-list" id={id} role="listbox" ref={list} onMouseDown={(e) => e.preventDefault()}>
          {shown.map(([v, l, b, c], i) => (
            <li
              key={v}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              // preventDefault: the wrapping <label> would otherwise refocus the input and reopen the list.
              onClick={(e) => {
                e.preventDefault();
                pick(shown[i]);
              }}
            >
              {b && (
                <span className="badge" style={c ? { "--b": c, "--bi": ink(c) } : undefined}>
                  {b}
                </span>
              )}
              <span>{l}</span>
              {v === value && <span className="check">✓</span>}
            </li>
          ))}
          {!shown.length && <li className="mute">Tidak ditemukan</li>}
        </ul>
      )}
    </div>
  );
}
