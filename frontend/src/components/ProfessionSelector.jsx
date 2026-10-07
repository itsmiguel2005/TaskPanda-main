import { useEffect, useMemo, useRef, useState } from "react";
import { PROFESSIONS } from "../utils/professions.js";

export default function ProfessionSelector({
  value = [],
  onChange,
  placeholder = "Type or select a profession...",
  id = "professions",
  invalid = false,
  tone = "green",
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listId = `${id}-suggestions`;
  const normalizedValue = value.map((profession) => profession.toLowerCase());

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROFESSIONS.filter((profession) => (
      (!q || profession.toLowerCase().includes(q))
      && !value.some((selected) => selected.toLowerCase() === profession.toLowerCase())
    ));
  }, [query, value]);
  const exactMatch = PROFESSIONS.find((profession) => profession.toLowerCase() === query.trim().toLowerCase());
  const canAddCustom = Boolean(query.trim()) && !normalizedValue.includes(query.trim().toLowerCase()) && !exactMatch;
  const optionCount = suggestions.length + (canAddCustom ? 1 : 0);
  const accents = tone === "blue"
    ? {
      border: "border-blue-500",
      ring: "ring-blue-500/20",
      chip: "bg-blue-100 text-blue-900",
      chipAction: "text-blue-700 hover:text-blue-950",
      hover: "hover:bg-blue-50 hover:text-blue-950",
      active: "bg-blue-50 text-blue-950",
    }
    : {
      border: "border-green-500",
      ring: "ring-green-500/25",
      chip: "bg-green-100 text-green-900",
      chipAction: "text-green-700 hover:text-green-950",
      hover: "hover:bg-green-50 hover:text-green-950",
      active: "bg-green-50 text-green-950",
    };

  const addProfession = (profession) => {
    const trimmed = profession.trim().replace(/\s+/g, " ");
    if (!trimmed || normalizedValue.includes(trimmed.toLowerCase())) return;
    onChange([...value, trimmed]);
    setQuery("");
    setActiveIndex(-1);
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const removeProfession = (profession) => {
    onChange(value.filter((selected) => selected !== profession));
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Backspace" && query === "" && value.length > 0) {
      event.preventDefault();
      removeProfession(value[value.length - 1]);
      return;
    }
    if (event.key === "ArrowDown" && optionCount > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % optionCount);
      return;
    }
    if (event.key === "ArrowUp" && optionCount > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index <= 0 ? optionCount - 1 : index - 1));
      return;
    }
    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        addProfession(suggestions[activeIndex]);
      } else if (activeIndex === suggestions.length && canAddCustom) {
        addProfession(query);
      } else if (exactMatch) {
        addProfession(exactMatch);
      } else if (canAddCustom) {
        addProfession(query);
      }
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex min-h-12 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-sm text-slate-800 transition-[border-color,box-shadow,background-color] ${
          invalid
            ? "border-red-500 bg-red-50/40 ring-2 ring-red-500/15"
            : isOpen
              ? `${accents.border} ${accents.ring} ring-2`
              : "border-slate-300 hover:border-slate-400"
        }`}
        onClick={() => {
          inputRef.current?.focus();
          setIsOpen(true);
        }}
      >
        {value.map((profession) => (
          <span key={profession} className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${accents.chip}`}>
            <span className="truncate">{profession}</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeProfession(profession);
              }}
              className={`shrink-0 rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current ${accents.chipAction}`}
              aria-label={`Remove ${profession}`}
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                <path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="auth-inline-field min-w-32 flex-1 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-500"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          aria-invalid={invalid || undefined}
        />
      </div>

      {isOpen && optionCount > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Profession suggestions"
          className="absolute z-30 mt-1.5 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10"
        >
          {suggestions.map((profession, index) => (
            <li key={profession} id={`${listId}-option-${index}`} role="option" aria-selected={activeIndex === index}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => addProfession(profession)}
                onMouseDown={(event) => event.preventDefault()}
                className={`w-full px-3.5 py-2.5 text-left text-sm transition-colors ${
                  activeIndex === index ? accents.active : `text-slate-700 ${accents.hover}`
                }`}
              >
                {profession}
              </button>
            </li>
          ))}
          {canAddCustom && (
            <li id={`${listId}-option-${suggestions.length}`} role="option" aria-selected={activeIndex === suggestions.length}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => addProfession(query)}
                onMouseDown={(event) => event.preventDefault()}
                className={`w-full border-t border-slate-100 px-3.5 py-2.5 text-left text-sm transition-colors ${
                  activeIndex === suggestions.length ? accents.active : `text-slate-700 ${accents.hover}`
                }`}
              >
                Add “{query.trim().replace(/\s+/g, " ")}”
              </button>
            </li>
          )}
        </ul>
      )}

      {isOpen && query.trim() && optionCount === 0 && (
        <p className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600 shadow-lg shadow-slate-900/10">
          This profession is already selected.
        </p>
      )}
    </div>
  );
}
