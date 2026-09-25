import { useState, useRef, useEffect } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarPicker({ selectedDate, onSelect, onClose }) {
  const [viewDate, setViewDate] = useState(selectedDate ? new Date(selectedDate) : new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} />;
          const dateObj = new Date(year, month, d);
          const isToday = dateObj.getTime() === today.getTime();
          const isSelected = selectedDate && dateObj.getTime() === new Date(selectedDate).setHours(0,0,0,0);
          return (
            <button
              key={d}
              onClick={() => { onSelect(dateObj.toISOString().split("T")[0]); onClose(); }}
              className={`rounded-full py-1 text-sm transition ${
                isSelected
                  ? "bg-gray-900 text-white font-semibold"
                  : isToday
                  ? "bg-gray-100 text-gray-900 font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RequestBookingModal({ provider, onClose }) {
  const [taskDescription, setTaskDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  if (!provider) return null;

  const initials = provider.initials || "SP";
  const name = provider.name || "Sweetie Palm";
  const trade = provider.trade || "Carpentry Services";

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Select Date";
    const [y, m, d] = dateStr.split("-");
    return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-bold text-gray-900">Request Booking</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider Summary Card */}
        <div className="mx-6 mb-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-800 text-sm font-bold text-white">
            {initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{name}</p>
            <p className="text-xs text-gray-500">{trade}</p>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-6 space-y-5">
          {/* Task Description */}
          <div>
            <label htmlFor="task" className="mb-1.5 block text-sm font-medium text-gray-700">
              What do you need help with?
            </label>
            <textarea
              id="task"
              rows={4}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe the exact task (e.g., Assemble a new desktop table, fix broken cabinet hinges...)"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Add Photos (Optional)
            </label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 transition hover:border-primary-400 hover:bg-primary-50/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mb-2 h-8 w-8 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Click to upload or take a photo</p>
              <p className="mt-1 text-xs text-gray-400">PNG, JPG up to 10MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {selectedFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {selectedFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <span className="truncate text-xs font-medium text-gray-700">{file.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      className="ml-2 text-gray-400 hover:text-red-500"
                      aria-label={`Remove ${file.name}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Date Selection */}
          <div className="relative">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Select Date
            </label>
            <button
              type="button"
              onClick={() => setShowCalendar(!showCalendar)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                selectedDate
                  ? "border-primary-500 bg-primary-50/50 text-gray-900"
                  : "border-gray-300 bg-white text-gray-400"
              } focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30`}
            >
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                {formatDate(selectedDate)}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`h-4 w-4 transition ${showCalendar ? "rotate-180" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showCalendar && (
              <div className="absolute z-10 mt-1 w-full">
                <CalendarPicker selectedDate={selectedDate} onSelect={setSelectedDate} onClose={() => setShowCalendar(false)} />
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Request Booking -&gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
