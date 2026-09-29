import { useState, useRef, useEffect, useMemo } from "react";

const PROFESSIONS = [
  "Electrician",
  "Plumber",
  "Aircon Tech",
  "Carpenter",
  "Painter",
  "Welder",
  "Construction Worker",
  "Appliance Tech",
  "Housekeeper",
  "Home Chef",
  "Gardener",
  "Disinfection",
  "Delivery Rider",
  "Transport Helper",
  "IT Tech",
  "IT Repair",
];;

export default function ProfessionSelector({ value = [], onChange, placeholder = "Type or select a profession..." }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    let results;
    if (!q) {
      results = PROFESSIONS.filter((p) => !value.includes(p));
    } else {
      results = PROFESSIONS.filter(
        (p) => p.toLowerCase().includes(q) && !value.includes(p)
      );
    }
    return results;
  }, [query, value]);

  const addProfession = (profession) => {
    const trimmed = profession.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setQuery("");
    setIsOpen(false);
  };

  const removeProfession = (profession) => {
    onChange(value.filter((p) => p !== profession));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Backspace" && query === "" && value.length > 0) {
      e.preventDefault();
      removeProfession(value[value.length - 1]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const exactMatch = PROFESSIONS.find((profession) => profession.toLowerCase() === query.trim().toLowerCase());
      if (exactMatch) addProfession(exactMatch);
      return;
    }
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setIsOpen(true);
      return;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 min-h-[44px] w-full rounded-lg border bg-green-50/50 px-3 py-2 text-sm text-gray-800 transition-colors cursor-text ${
          isOpen
            ? "border-green-500 ring-2 ring-green-500/30"
            : "border-green-200 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
        }`}
        onClick={() => {
          setIsOpen(true);
        }}
      >
        {value.map((profession) => (
          <span
            key={profession}
            className="inline-flex items-center gap-1 bg-green-100 text-green-800 rounded-md px-2 py-1 text-xs font-medium"
          >
            {profession}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                removeProfession(profession);
              }}
              className="ml-0.5 text-green-600 hover:text-green-900 focus:outline-none"
              aria-label={`Remove ${profession}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder-gray-400/70 text-sm py-0.5"
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => addProfession(s)}
                onMouseDown={(e) => e.preventDefault()}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 transition-colors"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && query.trim() && suggestions.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg px-3 py-2 text-sm text-gray-400">
          No suggestions found
        </div>
      )}
    </div>
  );
}
