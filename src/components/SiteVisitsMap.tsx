import React from "react";
import {
  MapPin,
  ExternalLink,
  Compass,
} from "lucide-react";
import { FieldVisit } from "../lib/site-visits";

interface SiteVisitsMapProps {
  visits: FieldVisit[];
  selectedVisit?: FieldVisit | null;
  onSelectVisit?: (visit: FieldVisit) => void;
  height?: number | string;
  showAllMarkers?: boolean;
}

/**
 * Interactive visual map component rendered via OpenStreetMap standard embed iframe
 * with custom interactive side panel / HUD matching Teamstuff warm aesthetic.
 */
export default function SiteVisitsMap({
  visits,
  selectedVisit,
  onSelectVisit,
  height = 420,
  showAllMarkers = true,
}: SiteVisitsMapProps) {
  // Determine focused coordinate
  const activeFocus = selectedVisit || (visits.length > 0 ? visits[0] : null);
  const lat = activeFocus ? activeFocus.start_lat : 19.076;
  const lng = activeFocus ? activeFocus.start_lng : 72.8777;

  // Bounding box delta for viewport zoom
  const delta = selectedVisit ? 0.008 : 0.05;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  // OpenStreetMap embed URL with live pinpoint marker
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${lat},${lng}`;

  const googleMapsDirectionsUrl = activeFocus
    ? activeFocus.end_lat && activeFocus.end_lng
      ? `https://www.google.com/maps/dir/?api=1&origin=${activeFocus.start_lat},${activeFocus.start_lng}&destination=${activeFocus.end_lat},${activeFocus.end_lng}`
      : `https://www.google.com/maps/search/?api=1&query=${activeFocus.start_lat},${activeFocus.start_lng}`
    : `https://www.google.com/maps`;

  return (
    <div >
      {/* Header bar */}
      <div >
        <div >
          <div >
            <Compass size={16} />
          </div>
          <div>
            <p >
              {activeFocus ? activeFocus.client_name : "GPS Location Visualizer"}
            </p>
            <p >
              {activeFocus
                ? activeFocus.start_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                : "Select a visit to view GPS coordinates"}
            </p>
          </div>
        </div>

        <div >
          {activeFocus && (
            <span >
              <MapPin size={11}  />
              {activeFocus.start_lat.toFixed(4)}, {activeFocus.start_lng.toFixed(4)}
            </span>
          )}

          <a
            href={googleMapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            
          >
            <span>Open in Maps</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Map view container */}
      <div style={{ height }} >
        <iframe
          title="Site Visit OpenStreetMap View"
          width="100%"
          height="100%"
          src={embedUrl}
          className="filter contrast-105 saturate-95"
        />

        {/* Floating Quick Visit Selector HUD */}
        {showAllMarkers && visits.length > 1 && (
          <div >
            {visits.slice(0, 6).map((v) => {
              const isSelected = activeFocus?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVisit && onSelectVisit(v)}
                  className={`${ isSelected ? "" : "" }`}
                >
                  <p className={`${isSelected ? "" : ""}`}>
                    {v.client_name}
                  </p>
                  <p className={`${isSelected ? "" : ""}`}>
                    {v.start_address || "Visit"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
