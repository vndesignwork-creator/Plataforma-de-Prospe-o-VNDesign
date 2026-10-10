'use client';

import 'leaflet/dist/leaflet.css';
import { LEAD_STATUS_META, formatCurrency, type MapLead, leadPath } from '@vndesign/core';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import Link from 'next/link';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { SectorIconView, StatusIcon } from '@/components/icons/lead-icons';

/** Amadora — centro por omissão. */
const DEFAULT_CENTER: LatLngExpression = [38.7538, -9.2308];

// Mapas do OpenStreetMap (sem chave; o CARTO passou a pedir uma). No tema escuro
// os mosaicos são invertidos por CSS (.vnd-tiles-dark em globals.css).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function FitBounds({ leads, focusId }: { leads: MapLead[]; focusId: string | null }) {
  const map = useMap();
  const key = leads.map((l) => l.id).join(',');
  useEffect(() => {
    const focus = focusId ? leads.find((l) => l.id === focusId) : null;
    if (focus) {
      map.setView([focus.latitude, focus.longitude], 16);
      return;
    }
    if (!leads.length) return;
    const bounds: LatLngBoundsExpression = leads.map((l) => [l.latitude, l.longitude] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando muda o conjunto de leads ou o foco
  }, [key, focusId, map]);
  return null;
}

function ClickToPlace({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export interface LeafletMapProps {
  leads: MapLead[];
  theme: 'dark' | 'light';
  focusId: string | null;
  placing: boolean;
  onPlace: (lat: number, lng: number) => void;
}

export default function LeafletMap({ leads, theme, focusId, placing, onPlace }: LeafletMapProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={12}
      scrollWheelZoom
      className={`h-full w-full ${placing ? 'cursor-crosshair' : ''}`}
      style={{ background: theme === 'dark' ? '#1a1a1a' : '#e8e4dc' }}
    >
      <TileLayer
        key={theme}
        url={TILES}
        attribution={ATTRIBUTION}
        maxZoom={19}
        className={theme === 'dark' ? 'vnd-tiles-dark' : undefined}
      />
      <FitBounds leads={leads} focusId={focusId} />
      {placing ? <ClickToPlace onPlace={onPlace} /> : null}
      {leads.map((lead) => {
        const meta = LEAD_STATUS_META[lead.status];
        const focused = lead.id === focusId;
        return (
          <CircleMarker
            key={lead.id}
            center={[lead.latitude, lead.longitude]}
            radius={focused ? 11 : 8}
            pathOptions={{
              color: theme === 'dark' ? '#0d0d0d' : '#ffffff',
              weight: 2,
              fillColor: meta.color,
              fillOpacity: lead.geocode_status === 'approx' ? 0.55 : 0.95,
              dashArray: lead.geocode_status === 'approx' ? '3 3' : undefined,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              #{lead.number} {lead.company_name}
            </Tooltip>
            <Popup>
              <div className="flex flex-col gap-1 text-sm" style={{ minWidth: 180 }}>
                <strong>
                  #{lead.number} {lead.company_name}
                </strong>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <StatusIcon status={lead.status} className="h-3.5 w-3.5" /> {meta.label}
                  {lead.sector ? (
                    <>
                      {' · '}
                      <SectorIconView sector={lead.sector} className="h-3.5 w-3.5" /> {lead.sector.name}
                    </>
                  ) : null}
                </span>
                {lead.address || lead.city ? <span>{lead.address ?? lead.city}</span> : null}
                {lead.geocode_status === 'approx' ? <em>Posição aproximada (cidade)</em> : null}
                {lead.estimated_value ? <span>Valor: {formatCurrency(lead.estimated_value, { decimals: false })}</span> : null}
                <Link href={leadPath(lead)} style={{ color: '#c2410c', fontWeight: 600 }}>
                  Abrir lead →
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
