import { useState } from "react";

export default function AddressActions({ address }) {
  const [copied, setCopied] = useState(false);
  const safeAddress = String(address || "").trim();
  if (!safeAddress || safeAddress === "Address to be confirmed") return <span>{address}</span>;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(safeAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this address", safeAddress);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{safeAddress}</span>
      <button type="button" onClick={copyAddress} className="text-xs font-semibold text-primary-700 underline underline-offset-2" aria-label="Copy address">
        {copied ? "Copied" : "Copy"}
      </button>
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeAddress)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-700 underline underline-offset-2">
        Open map
      </a>
    </span>
  );
}
