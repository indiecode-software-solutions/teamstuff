import React, { useEffect, useRef, useState } from "react";
import { MapPin, ExternalLink, Navigation } from "lucide-react";

export interface VisualMapProps {
  startLat?: number | null | undefined;
  startLng?: number | null | undefined;
  startLabel?: string;
  endLat?: number | null | undefined;
  endLng?: number | null | undefined;
  endLabel?: string;
  height?: number | string;
  showBottomLegend?: boolean;
}

export default function VisualMap({
  startLat,
  startLng,
  startLabel = "Start Location",
  endLat,
  endLng,
  endLabel = "End Location",
  height = "100%",
  showBottomLegend = false,
}: VisualMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const hasStart = startLat != null && startLng != null;
  const hasEnd = endLat != null && endLng != null;

  const sLat = hasStart ? startLat! : 19.9975;
  const sLng = hasStart ? startLng! : 73.7898;

  const googleMapsUrl =
    hasStart && hasEnd
      ? `https://www.google.com/maps/dir/?api=1&origin=${sLat},${sLng}&destination=${endLat},${endLng}`
      : `https://www.google.com/maps/search/?api=1&query=${sLat},${sLng}`;

  // Dynamically load Leaflet CDN if not already loaded
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if ((window as any).L) {
      setLeafletLoaded(true);
      return undefined;
    }

    // Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    // Leaflet JS
    if (!document.getElementById("leaflet-js")) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "";
      script.onload = () => {
        setLeafletLoaded(true);
      };
      document.head.appendChild(script);
      return undefined;
    } else {
      const checkLeaflet = setInterval(() => {
        if ((window as any).L) {
          clearInterval(checkLeaflet);
          setLeafletLoaded(true);
        }
      }, 100);
      return () => clearInterval(checkLeaflet);
    }
  }, []);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const container = mapContainerRef.current;
    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstanceRef.current = map;

    // OpenStreetMap standard tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: false,
    }).addTo(map);

    // Custom Marker Pin Generator
    const createCustomIcon = (
      type: "start" | "end",
      title: string,
      color: string,
      textColor: string
    ) => {
      const html = `
        <div style="
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-50%, -100%);
        ">
          <div style="
            background: ${color};
            color: ${textColor};
            padding: 4px 9px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            font-family: system-ui, -apple-system, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            border: 2px solid #FFFFFF;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 5px;
          ">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#FFFFFF;"></span>
            ${title}
          </div>
          <div style="
            width: 0; 
            height: 0; 
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 7px solid ${color};
            margin-top: -1px;
          "></div>
        </div>
      `;

      return L.divIcon({
        className: "custom-leaflet-marker",
        html,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
    };

    const markers: any[] = [];

    // Start Marker (Blue)
    if (hasStart) {
      const startIcon = createCustomIcon(
        "start",
        startLabel || "Start Visit",
        "#2563eb",
        "#FFFFFF"
      );
      const startMarker = L.marker([sLat, sLng], { icon: startIcon }).addTo(map);
      startMarker.bindPopup(`<strong>${startLabel}</strong><br/>Lat: ${sLat.toFixed(5)}<br/>Lng: ${sLng.toFixed(5)}`);
      markers.push(startMarker);
    }

    // End Marker (Emerald) & Connection Polyline
    if (hasStart && hasEnd && endLat != null && endLng != null) {
      const endIcon = createCustomIcon(
        "end",
        endLabel || "End Visit",
        "#059669",
        "#FFFFFF"
      );
      const endMarker = L.marker([endLat, endLng], { icon: endIcon }).addTo(map);
      endMarker.bindPopup(`<strong>${endLabel}</strong><br/>Lat: ${endLat.toFixed(5)}<br/>Lng: ${endLng.toFixed(5)}`);
      markers.push(endMarker);

      // Connection Route Line
      const latlngs = [
        [sLat, sLng],
        [endLat, endLng],
      ];

      // Outer glow line
      L.polyline(latlngs, {
        color: "#2563EB",
        weight: 6,
        opacity: 0.25,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // Inner dashed line
      L.polyline(latlngs, {
        color: "#2563EB",
        weight: 3.5,
        opacity: 0.9,
        dashArray: "8, 8",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // Midpoint Distance Badge
      const midLat = (sLat + endLat) / 2;
      const midLng = (sLng + endLng) / 2;

      const R = 6371;
      const dLat = ((endLat - sLat) * Math.PI) / 180;
      const dLon = ((endLng - sLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((sLat * Math.PI) / 180) *
          Math.cos((endLat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distKm = R * c;
      const distStr = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(2)} km`;

      const badgeHtml = `
        <div style="
          transform: translate(-50%, -50%);
          background: #FFFFFF;
          color: #1E293B;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1.5px solid #2563EB;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: system-ui, -apple-system, sans-serif;
        ">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#2563EB;"></span>
          <span>${distStr}</span>
        </div>
      `;

      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "connection-midpoint-badge",
          html: badgeHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      }).addTo(map);

      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView([sLat, sLng], 15);
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletLoaded, hasStart, hasEnd, sLat, sLng, endLat, endLng, startLabel, endLabel]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: height || "100%",
        minHeight: "220px",
        backgroundColor: "#e2e8f0",
        overflow: "hidden",
      }}
    >
      {/* Floating "Open in Maps" Button */}
      <a
        href={googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          zIndex: 10,
          backgroundColor: "#ffffff",
          color: "#0f172a",
          padding: "5px 11px",
          borderRadius: "6px",
          border: "1px solid #cbd5e1",
          fontSize: "11px",
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          textDecoration: "none",
          boxShadow: "0 2px 5px rgba(0, 0, 0, 0.08)",
          transition: "all 0.15s ease",
        }}
      >
        <span>Open in Maps</span>
        <ExternalLink size={11} />
      </a>

      {/* Leaflet Map DOM Container */}
      <div
        ref={mapContainerRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      />

      {/* Optional Bottom Coordinates Bar */}
      {showBottomLegend && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            right: "10px",
            zIndex: 10,
            backgroundColor: "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(4px)",
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "#334155",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {hasStart && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#2563eb",
                }}
              />
              <span style={{ fontWeight: 600 }}>Start:</span>
              <span>
                {sLat.toFixed(4)}, {sLng.toFixed(4)}
              </span>
            </div>
          )}

          {hasEnd && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#059669",
                }}
              />
              <span style={{ fontWeight: 600 }}>End:</span>
              <span>
                {endLat!.toFixed(4)}, {endLng!.toFixed(4)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
