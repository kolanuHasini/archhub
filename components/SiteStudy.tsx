"use client";

import { useState } from "react";

// Everything recorded about the site itself.
export type SiteValues = {
  siteWidth: string; // metres
  siteDepth: string; // metres
  facing: string;
  roadWidth: string; // metres
  slope: string;
  vegetation: string;
  vegetationNotes: string;
  north: string;
  south: string;
  east: string;
  west: string;
  wind: string;
  lat: string;
  lon: string;
  siteChecklist: string[];
};

export const EMPTY_SITE: SiteValues = {
  siteWidth: "",
  siteDepth: "",
  facing: "",
  roadWidth: "",
  slope: "",
  vegetation: "",
  vegetationNotes: "",
  north: "",
  south: "",
  east: "",
  west: "",
  wind: "",
  lat: "",
  lon: "",
  siteChecklist: [],
};

export type SiteOptions = {
  directions: string[];
  slopes: string[];
  vegetation: string[];
  checklist: string[];
};

const SQ_FT_PER_SQ_M = 10.7639;

function toNumber(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Area of a rectangular site in square metres, or null if not filled in. */
export function siteArea(values: SiteValues): number | null {
  const width = toNumber(values.siteWidth);
  const depth = toNumber(values.siteDepth);
  if (width === null || depth === null || width <= 0 || depth <= 0) return null;
  return Math.round(width * depth * 10) / 10;
}

/** The map position, or null if the numbers are missing or impossible. */
export function sitePosition(values: SiteValues): [number, number] | null {
  const lat = toNumber(values.lat);
  const lon = toNumber(values.lon);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

const labelClass =
  "block font-mono text-xs uppercase tracking-widest text-muted";
const fieldClass =
  "mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const headingClass =
  "border-t border-line pt-5 font-mono text-xs uppercase tracking-widest text-accent";
const smallButton =
  "border border-ink rounded-md px-3.5 py-2 font-mono text-xs transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:opacity-60";

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
  numeric = false,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={numeric ? "decimal" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
    </div>
  );
}

export default function SiteStudy({
  values,
  location,
  options,
  onChange,
}: {
  values: SiteValues;
  location: string;
  options: SiteOptions;
  onChange: (changes: Partial<SiteValues>) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  const area = siteArea(values);
  const position = sitePosition(values);

  // Looks up the typed location on OpenStreetMap (a free, public map).
  async function findOnMap() {
    const query = location.trim();
    if (!query) {
      setSearchMessage("Type the location above first.");
      return;
    }
    setSearching(true);
    setSearchMessage("");
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error("search failed");
      const results: unknown = await response.json();
      const first = Array.isArray(results) ? results[0] : null;
      if (!first || !first.lat || !first.lon) {
        setSearchMessage(
          "No place found with that name. Try adding the city or country, or type the latitude and longitude yourself.",
        );
      } else {
        onChange({
          lat: String(Number(first.lat).toFixed(5)),
          lon: String(Number(first.lon).toFixed(5)),
        });
        setSearchMessage(
          "Found. If the pin is not exactly on your site, correct the numbers below.",
        );
      }
    } catch {
      setSearchMessage(
        "The map search is not available right now. You can type the latitude and longitude yourself.",
      );
    } finally {
      setSearching(false);
    }
  }

  function toggleChecklist(item: string) {
    const done = values.siteChecklist.includes(item);
    onChange({
      siteChecklist: done
        ? values.siteChecklist.filter((entry) => entry !== item)
        : [...values.siteChecklist, item],
    });
  }

  const span = 0.0025; // how much map to show around the pin
  const mapUrl = position
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${position[1] - span},${position[0] - span},${position[1] + span},${position[0] + span}&layer=mapnik&marker=${position[0]},${position[1]}`
    : null;

  return (
    <>
      {/* Map */}
      <h3 className={headingClass}>Site on the map</h3>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={findOnMap}
          disabled={searching}
          className={smallButton}
        >
          {searching ? "Searching…" : "Find my location on the map"}
        </button>
        <span className="text-xs text-muted">
          This sends the location you typed to OpenStreetMap.
        </span>
      </div>
      {searchMessage && (
        <p role="status" className="text-sm text-accent">
          {searchMessage}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="cp-lat"
          label="Latitude"
          value={values.lat}
          placeholder="e.g. 17.38504"
          numeric
          onChange={(lat) => onChange({ lat })}
        />
        <TextField
          id="cp-lon"
          label="Longitude"
          value={values.lon}
          placeholder="e.g. 78.48667"
          numeric
          onChange={(lon) => onChange({ lon })}
        />
      </div>
      {mapUrl && position ? (
        <div>
          <iframe
            title="Map of the site"
            src={mapUrl}
            loading="lazy"
            className="h-72 w-full rounded-xl border border-line"
          />
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${position[0]},${position[1]}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-4"
            >
              Open in Google Maps (switch to Satellite to see trees and
              buildings)
            </a>
            <a
              href={`https://www.openstreetmap.org/?mlat=${position[0]}&mlon=${position[1]}#map=18/${position[0]}/${position[1]}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-4"
            >
              Open a larger map
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          The map appears here once the latitude and longitude are filled in.
          Tip: in Google Maps, right-click your site and the two numbers are
          shown at the top of the menu.
        </p>
      )}

      {/* Measurements */}
      <h3 className={headingClass}>Site measurements</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="cp-width"
          label="Width along the road (m)"
          value={values.siteWidth}
          placeholder="e.g. 18"
          numeric
          onChange={(siteWidth) => onChange({ siteWidth })}
        />
        <TextField
          id="cp-depth"
          label="Depth (m)"
          value={values.siteDepth}
          placeholder="e.g. 30"
          numeric
          onChange={(siteDepth) => onChange({ siteDepth })}
        />
        <TextField
          id="cp-road"
          label="Road width (m)"
          value={values.roadWidth}
          placeholder="e.g. 9"
          numeric
          onChange={(roadWidth) => onChange({ roadWidth })}
        />
      </div>
      <p className="text-sm text-muted">
        {area !== null ? (
          <>
            Area of a rectangular site this size:{" "}
            <strong className="text-ink">
              {area.toLocaleString()} m² (
              {Math.round(area * SQ_FT_PER_SQ_M).toLocaleString()} sq ft)
            </strong>
            . If your site is not a rectangle, note its real shape and area
            below.
          </>
        ) : (
          "Enter the width and depth to see the site area."
        )}
      </p>

      {/* Orientation, slope, wind */}
      <h3 className={headingClass}>Orientation and ground</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Choice
          id="cp-facing"
          label="The site faces (road side)"
          value={values.facing}
          options={options.directions}
          onChange={(facing) => onChange({ facing })}
        />
        <Choice
          id="cp-slope"
          label="Slope of the ground"
          value={values.slope}
          options={options.slopes}
          onChange={(slope) => onChange({ slope })}
        />
        <Choice
          id="cp-wind"
          label="Wind mostly comes from"
          value={values.wind}
          options={options.directions}
          onChange={(wind) => onChange({ wind })}
        />
      </div>

      {/* Vegetation */}
      <h3 className={headingClass}>Vegetation</h3>
      <Choice
        id="cp-vegetation"
        label="Vegetation on the site"
        value={values.vegetation}
        options={options.vegetation}
        onChange={(vegetation) => onChange({ vegetation })}
      />
      <div>
        <label htmlFor="cp-vegetation-notes" className={labelClass}>
          Which trees or plants, and where?
        </label>
        <textarea
          id="cp-vegetation-notes"
          rows={2}
          value={values.vegetationNotes}
          onChange={(event) => onChange({ vegetationNotes: event.target.value })}
          placeholder="e.g. three large neem trees along the west edge, to be kept"
          className={fieldClass}
        />
      </div>

      {/* Surroundings */}
      <h3 className={headingClass}>What is on each side?</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="cp-north"
          label="North"
          value={values.north}
          placeholder="e.g. two-storey houses"
          onChange={(north) => onChange({ north })}
        />
        <TextField
          id="cp-east"
          label="East"
          value={values.east}
          placeholder="e.g. a 9 m wide road"
          onChange={(east) => onChange({ east })}
        />
        <TextField
          id="cp-south"
          label="South"
          value={values.south}
          placeholder="e.g. an empty plot"
          onChange={(south) => onChange({ south })}
        />
        <TextField
          id="cp-west"
          label="West"
          value={values.west}
          placeholder="e.g. a park with a lake view"
          onChange={(west) => onChange({ west })}
        />
      </div>

      {/* Documentation checklist */}
      <h3 className={headingClass}>
        Site documentation checklist ({values.siteChecklist.length} of{" "}
        {options.checklist.length})
      </h3>
      <ul className="space-y-2">
        {options.checklist.map((item) => (
          <li key={item}>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={values.siteChecklist.includes(item)}
                onChange={() => toggleChecklist(item)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
