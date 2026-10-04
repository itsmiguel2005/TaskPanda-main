import { useEffect, useMemo, useRef, useState } from "react";
import sectors from "../../../shared/tesdaQualifications.json";

const qualifications = sectors.flatMap(({ sector, qualifications: sectorQualifications }) =>
  sectorQualifications.map((qualification) => ({ sector, qualification }))
);
const searchAliases = {
  "Computer Systems Servicing NC II": "computer technician IT support staff",
  "Visual Graphic Design NC III": "graphic designer layout artist",
  "Contact Center Services NC II": "call center agent customer service representative",
  "Animation NC II": "2d 3d animator",
  "Animation NC III": "2d 3d animator",
  "Cookery NC II": "line cook professional chef kitchen assistant",
  "Bread and Pastry Production NC II": "baker pastry chef",
  "Food and Beverage Services (FBS) NC II": "waiter food server barista",
  "Housekeeping NC II": "hotel room attendant housekeeper",
  "Front Office Services NC II": "hotel receptionist front desk agent",
  "Bartending NC II": "bartender",
  "Tour Guiding Services NC II": "tour guide",
  "Travel Services NC II": "travel consultant",
  "Electrical Installation and Maintenance NC II": "electrician maintenance technician",
  "Shielded Metal Arc Welding (SMAW) NC I": "welder fabricator",
  "Shielded Metal Arc Welding (SMAW) NC II": "welder fabricator",
  "Shielded Metal Arc Welding (SMAW) NC III": "welder fabricator",
  "Shielded Metal Arc Welding (SMAW) NC IV": "welder fabricator",
  "Carpentry NC II": "carpenter woodworker",
  "Carpentry NC III": "carpenter woodworker",
  "Masonry NC I": "mason bricklayer",
  "Masonry NC II": "mason bricklayer",
  "Plumbing NC I": "plumber pipefitter",
  "Plumbing NC II": "plumber pipefitter",
  "Tile Setting NC II": "tile setter",
  "Automotive Servicing NC I": "automotive mechanic vehicle service technician",
  "Automotive Servicing NC II": "automotive mechanic vehicle service technician",
  "Automotive Servicing NC III": "automotive mechanic vehicle service technician",
  "Driving NC II": "professional driver light vehicle bus truck",
  "Driving NC III": "professional driver light vehicle bus truck",
  "Motorcycle/Small Engine Servicing NC II": "motorcycle mechanic small engine",
  "Automotive Body Painting / Repairing NC II": "auto body painter panel beater",
  "Caregiving (Elderly / Special Needs / Infants) NC II": "caregiver nanny home health aide",
  "Health Care Services NC II": "health care assistant nursing aide",
  "Pharmacy Services NC III": "pharmacy assistant",
  "Massage Therapy NC II": "masseur massage therapist",
  "Emergency Medical Services NC II": "emergency medical technician EMT paramedic",
  "Emergency Medical Services NC III": "emergency medical technician EMT paramedic",
  "Bookkeeping NC III": "bookkeeper accounting clerk payroll assistant",
  "Microfinance Technology NC IV": "microfinance officer",
  "Human Resource Management / Events Management": "HR assistant event coordinator",
  "Agricultural Crops Production NC II": "agriculturist crop farmer",
  "Agricultural Crops Production NC III": "agriculturist crop farmer",
  "Organic Agriculture Production NC II": "organic farmer",
  "Animal Production (Poultry / Ruminants / Swine) NC II": "livestock poultry raiser",
  "Fish Production / Aquaculture": "fish farmer aquaculturist",
  "Consumer Electronics Servicing NC II": "electronics technician appliance repairman",
  "Consumer Electronics Servicing NC III": "electronics technician appliance repairman",
  "Consumer Electronics Servicing NC IV": "electronics technician appliance repairman",
  "Mechatronics Servicing NC II": "mechatronics technician",
  "Ship's Catering Services (Ship's Cook) NC I": "galley cook ship steward",
  "Ship's Catering Services (Ship's Cook) NC II": "galley cook ship steward",
  "Ship's Catering Services (Ship's Cook) NC III": "galley cook ship steward",
};

export default function TesdaQualificationSelector({ value, onChange, disabled = false }) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listId = "tesda-qualification-suggestions";

  useEffect(() => {
    setQuery(value);
  }, [value]);

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

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return qualifications.filter(({ sector, qualification }) =>
      !normalizedQuery ||
      qualification.toLowerCase().includes(normalizedQuery) ||
      searchAliases[qualification]?.toLowerCase().includes(normalizedQuery) ||
      sector.toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  const selectQualification = (qualification) => {
    onChange(qualification);
    setQuery(qualification);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      selectQualification(suggestions[activeIndex].qualification);
    } else if (event.key === "Escape") {
      setQuery(value);
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  let previousSector = "";
  let optionIndex = 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id="tesda-trade"
        name="trade"
        type="text"
        role="combobox"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type to search TESDA qualifications..."
        autoComplete="off"
        disabled={disabled}
        required
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        aria-invalid={!value || undefined}
        className="dashboard-focus mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
      />
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="TESDA qualifications"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10"
        >
          {suggestions.map(({ sector, qualification }) => {
            const index = optionIndex;
            optionIndex += 1;
            const showSector = sector !== previousSector;
            previousSector = sector;
            return (
              <li key={qualification} role="presentation">
                {showSector && <p className="px-3.5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{sector}</p>}
                <div
                  id={`${listId}-option-${index}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={activeIndex === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectQualification(qualification)}
                  className={`w-full px-3.5 py-2.5 text-left text-sm transition-colors ${
                    activeIndex === index ? "bg-sky-50 text-sky-950" : "bg-white text-sky-950 hover:bg-sky-50"
                  }`}
                >
                  {qualification}
                </div>
              </li>
            );
          })}
          {suggestions.length === 0 && (
            <li className="px-3.5 py-3 text-sm text-slate-600" role="presentation">
              No matching qualification. Try a different search term.
            </li>
          )}
        </ul>
      )}
      <p className="mt-2 text-xs leading-5 text-slate-600">Choose a qualification from the catalog to keep certificate details consistent.</p>
    </div>
  );
}
