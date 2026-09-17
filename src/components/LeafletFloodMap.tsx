import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { CityData, ZoneData, SimulationParams, ReliefShelter } from '../types';
import { RESOURCE_PREPOSITIONS, CHENNAI_HISTORICAL_OVERLAYS } from '../data/mockData';
import { Sliders, Layers, Search, MapPin, AlertTriangle, ShieldCheck, Navigation, Eye, EyeOff, RotateCcw } from 'lucide-react';

interface Props {
  city: CityData;
  zones: ZoneData[];
  selectedZone: ZoneData | null;
  onSelectZone: (zone: ZoneData) => void;
  simulationParams: SimulationParams;
  onUpdateParams: (newParams: SimulationParams) => void;
  onToggleDrainBlockage: (drainId: string) => void;
  onTogglePumpingStation: (drainId: string) => void;
}

export const LeafletFloodMap: React.FC<Props> = ({
  city,
  zones,
  selectedZone,
  onSelectZone,
  simulationParams,
  onUpdateParams,
  onToggleDrainBlockage,
  onTogglePumpingStation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Overlay state toggles
  const [show2015Historical, setShow2015Historical] = useState(false);
  const [show2023Historical, setShow2023Historical] = useState(false);
  const [showShelters, setShowShelters] = useState(true);
  const [showDrains, setShowDrains] = useState(true);
  const [showResources, setShowResources] = useState(true);
  const [showEvacRoutes, setShowEvacRoutes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Risk Color Mapping
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical':
        return '#e11d48'; // Rose-600
      case 'severe':
        return '#f43f5e'; // Rose-500
      case 'high':
        return '#f97316'; // Orange-500
      case 'moderate':
        return '#eab308'; // Yellow-500
      default:
        return '#10b981'; // Emerald-500
    }
  };

  // Geographic coordinates for Chennai zones
  const ZONE_COORDINATES: Record<string, { center: [number, number]; polygon: [number, number][] }> = {
    velachery: {
      center: [12.9815, 80.2180],
      polygon: [
        [12.9920, 80.2080],
        [12.9900, 80.2290],
        [12.9710, 80.2310],
        [12.9680, 80.2120],
        [12.9780, 80.2040],
      ]
    },
    mudichur: {
      center: [12.9230, 80.0760],
      polygon: [
        [12.9360, 80.0620],
        [12.9340, 80.0910],
        [12.9120, 80.0930],
        [12.9090, 80.0680],
      ]
    },
    madipakkam: {
      center: [12.9647, 80.1961],
      polygon: [
        [12.9750, 80.1860],
        [12.9740, 80.2070],
        [12.9540, 80.2050],
        [12.9530, 80.1850],
      ]
    },
    omr: {
      center: [12.9654, 80.2461],
      polygon: [
        [12.9820, 80.2380],
        [12.9780, 80.2590],
        [12.9420, 80.2520],
        [12.9460, 80.2360],
      ]
    },
    tnagar: {
      center: [13.0418, 80.2341],
      polygon: [
        [13.0520, 80.2220],
        [13.0510, 80.2480],
        [13.0310, 80.2450],
        [13.0320, 80.2210],
      ]
    },
    vyasarpadi: {
      center: [13.1116, 80.2608],
      polygon: [
        [13.1240, 80.2490],
        [13.1220, 80.2740],
        [13.0990, 80.2710],
        [13.1010, 80.2480],
      ]
    },
    kurla: {
      center: [19.0657, 72.8794],
      polygon: [
        [19.0760, 72.8680],
        [19.0740, 72.8920],
        [19.0540, 72.8890],
        [19.0560, 72.8690],
      ]
    },
    bellandur: {
      center: [12.9304, 77.6784],
      polygon: [
        [12.9420, 77.6650],
        [12.9400, 77.6920],
        [12.9180, 77.6890],
        [12.9200, 77.6660],
      ]
    }
  };

  // Safe evacuation routes & submerged corridors
  const EVACUATION_ROUTES = [
    {
      name: 'Vijaya Nagar Flyover Elevated Dry Route',
      zoneId: 'velachery',
      type: 'safe',
      path: [
        [12.9780, 80.2180],
        [12.9830, 80.2210],
        [12.9910, 80.2250],
        [12.9960, 80.2280]
      ],
      desc: 'Elevated roadway (+6m MSL). Clear of water.'
    },
    {
      name: '100ft Bypass Road Submerged Siphon (HAZARD)',
      zoneId: 'velachery',
      type: 'hazard',
      path: [
        [12.9720, 80.2190],
        [12.9770, 80.2210],
        [12.9810, 80.2230]
      ],
      desc: 'Submerged under 55cm. Road impassable.'
    },
    {
      name: 'Mudichur High Bund Bypass to Tambaram Sanatorium',
      zoneId: 'mudichur',
      type: 'safe',
      path: [
        [12.9210, 80.0780],
        [12.9300, 80.0880],
        [12.9410, 80.1120]
      ],
      desc: 'High ridge road leading to Tambaram elevated bridge.'
    }
  ];

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [city.lat, city.lng],
        zoom: 12,
        zoomControl: true,
      });

      // Dark Matter Carto Tiles for professional command center look
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([city.lat, city.lng], 12);
    }

    return () => {
      // Keep map instance alive across re-renders
    };
  }, [city.id]);

  // Update Layers on Map whenever simulation or toggles change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Render Zone Polygons
    zones.forEach((zone) => {
      const coords = ZONE_COORDINATES[zone.id];
      const riskColor = getRiskColor(zone.currentRisk);

      if (coords) {
        const polygon = L.polygon(coords.polygon, {
          color: riskColor,
          weight: selectedZone?.id === zone.id ? 3 : 1.5,
          fillColor: riskColor,
          fillOpacity: 0.35 + (zone.predictedInundationDepthCm / 200) * 0.35,
          dashArray: selectedZone?.id === zone.id ? undefined : '4, 4',
        });

        polygon.on('click', () => {
          onSelectZone(zone);
        });

        // Popup
        polygon.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; color: #f8fafc;">
            <div style="font-weight: bold; font-size: 14px; color: #38bdf8; margin-bottom: 4px;">${zone.name}</div>
            <div style="color: #94a3b8; margin-bottom: 6px;">Ward Numbers: ${zone.wardNumbers.join(', ')}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; background: #020617; padding: 6px; border-radius: 6px;">
              <div><strong>Water Depth:</strong> <span style="color: #f43f5e; font-weight: bold;">${zone.predictedInundationDepthCm} cm</span></div>
              <div><strong>Elevation:</strong> ${zone.averageElevationM} m MSL</div>
              <div><strong>Alert Tier:</strong> <span style="text-transform: uppercase; color: #fbbf24; font-weight: bold;">${zone.alertTier}</span></div>
              <div><strong>Population:</strong> ${zone.population.toLocaleString()}</div>
            </div>
            <div style="font-size: 11px; color: #cbd5e1;">Click zone to inspect street-level tipping points.</div>
          </div>
        `);

        layerGroup.addLayer(polygon);

        // Center Marker with Inundation Badge
        const customIcon = L.divIcon({
          className: 'custom-zone-label',
          html: `
            <div style="
              background: #0f172a;
              border: 1px solid ${riskColor};
              color: white;
              padding: 2px 6px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: bold;
              white-space: nowrap;
              box-shadow: 0 4px 10px rgba(0,0,0,0.5);
              transform: translate(-50%, -50%);
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${riskColor};"></span>
              <span>${zone.name.split(' ')[0]}</span>
              <span style="color: ${riskColor}; font-family: monospace;">${zone.predictedInundationDepthCm}cm</span>
            </div>
          `,
          iconSize: [80, 20],
        });

        const labelMarker = L.marker(coords.center, { icon: customIcon });
        labelMarker.on('click', () => onSelectZone(zone));
        layerGroup.addLayer(labelMarker);
      }
    });

    // 2. Render Historical Overlays if enabled
    if (show2015Historical) {
      // 2015 Deluge Boundary
      const hist2015 = L.polygon([
        [13.0020, 80.1980],
        [13.0000, 80.2450],
        [12.9550, 80.2480],
        [12.9450, 80.2050],
        [12.9050, 80.0550],
        [12.9450, 80.0500],
      ], {
        color: '#ef4444',
        weight: 2,
        dashArray: '8, 8',
        fillColor: '#ef4444',
        fillOpacity: 0.25,
      });
      hist2015.bindTooltip('2015 Deluge (494mm Peak Flooding Zone)', { sticky: true });
      layerGroup.addLayer(hist2015);
    }

    if (show2023Historical) {
      // 2023 Cyclone Michaung Boundary
      const hist2023 = L.polygon([
        [12.9900, 80.2050],
        [12.9850, 80.2400],
        [12.9500, 80.2350],
        [12.9400, 80.2000],
      ], {
        color: '#f97316',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#f97316',
        fillOpacity: 0.2,
      });
      hist2023.bindTooltip('2023 Cyclone Michaung (390mm Inundation Zone)', { sticky: true });
      layerGroup.addLayer(hist2023);
    }

    // 3. Render Evacuation Routes
    if (showEvacRoutes) {
      EVACUATION_ROUTES.forEach((route) => {
        const isSafe = route.type === 'safe';
        const polyline = L.polyline(route.path as [number, number][], {
          color: isSafe ? '#10b981' : '#f43f5e',
          weight: isSafe ? 4 : 3,
          dashArray: isSafe ? '6, 8' : '3, 6',
          opacity: 0.9,
        });

        polyline.bindPopup(`
          <div style="font-size: 11px; color: white;">
            <strong style="color: ${isSafe ? '#34d399' : '#fb7185'}">${route.name}</strong>
            <div style="margin-top: 4px; color: #cbd5e1;">${route.desc}</div>
          </div>
        `);

        layerGroup.addLayer(polyline);
      });
    }

    // 4. Render Drainage Channels and Bottlenecks
    if (showDrains) {
      city.drainageChannels.forEach((drain, index) => {
        const isBlocked = simulationParams.blockedDrainIds.includes(drain.id);
        const drainCoords: [number, number] = [
          city.lat - 0.02 + index * 0.015,
          city.lng - 0.03 + index * 0.02,
        ];

        const drainIcon = L.divIcon({
          className: 'custom-drain-icon',
          html: `
            <div style="
              background: ${isBlocked ? '#e11d48' : '#0284c7'};
              border: 2px solid white;
              color: white;
              width: 22px;
              height: 22px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: bold;
              box-shadow: 0 0 12px ${isBlocked ? 'rgba(225, 29, 72, 0.8)' : 'rgba(2, 132, 199, 0.5)'};
              cursor: pointer;
            ">
              ${isBlocked ? '✕' : '⚡'}
            </div>
          `,
          iconSize: [22, 22],
        });

        const drainMarker = L.marker(drainCoords, { icon: drainIcon });
        drainMarker.bindPopup(`
          <div style="font-size: 12px; color: white;">
            <div style="font-weight: bold; color: #38bdf8;">${drain.name}</div>
            <div style="font-size: 11px; color: #94a3b8;">Type: ${drain.type.replace('_', ' ')}</div>
            <div style="margin: 6px 0; font-size: 11px;">
              <div>Flow: <strong>${drain.currentFlowCusecs}</strong> / ${drain.maxCapacityCusecs} cusecs</div>
              <div>Status: <span style="color: ${isBlocked ? '#f43f5e' : '#34d399'}; font-weight: bold;">${isBlocked ? 'CHOKED (Click to Unclog)' : 'OPERATIONAL'}</span></div>
            </div>
          </div>
        `);

        drainMarker.on('click', () => {
          onToggleDrainBlockage(drain.id);
        });

        layerGroup.addLayer(drainMarker);
      });
    }

    // 5. Render Relief Shelters
    if (showShelters) {
      city.reliefShelters.forEach((shelter) => {
        const shelterCoords: [number, number] = [
          city.lat + (shelter.id === 'sh-1' ? -0.015 : shelter.id === 'sh-2' ? 0.02 : -0.04),
          city.lng + (shelter.id === 'sh-1' ? 0.01 : shelter.id === 'sh-2' ? -0.01 : -0.05),
        ];

        const shelterIcon = L.divIcon({
          className: 'custom-shelter-icon',
          html: `
            <div style="
              background: #059669;
              border: 2px solid white;
              color: white;
              padding: 2px 6px;
              border-radius: 9999px;
              font-size: 10px;
              font-weight: bold;
              white-space: nowrap;
              box-shadow: 0 4px 10px rgba(0,0,0,0.4);
              display: flex;
              align-items: center;
              gap: 3px;
            ">
              <span>🏠</span>
              <span>${shelter.name.split(' ')[0]}</span>
            </div>
          `,
          iconSize: [70, 20],
        });

        const shelterMarker = L.marker(shelterCoords, { icon: shelterIcon });
        shelterMarker.bindPopup(`
          <div style="font-size: 12px; color: white;">
            <div style="font-weight: bold; color: #34d399; font-size: 13px;">${shelter.name}</div>
            <div style="font-size: 11px; color: #94a3b8;">${shelter.address}</div>
            <div style="margin: 6px 0; background: #020617; padding: 6px; border-radius: 6px; font-size: 11px;">
              <div>Capacity: <strong>${shelter.currentOccupancyPersons} / ${shelter.capacityPersons}</strong> persons</div>
              <div>Ground Elevation: <strong>${shelter.elevationM}m MSL (Safe Dry Ground)</strong></div>
              <div>Power Backup: <strong>${shelter.hasPowerBackup ? 'Yes (Diesel Gen)' : 'No'}</strong></div>
              <div>Medical Post: <strong>${shelter.hasMedicalPost ? 'Active Doctors On-Site' : 'Basic Aid'}</strong></div>
            </div>
            <div style="color: #38bdf8; font-size: 11px;">Helpline: ${shelter.contactNumber}</div>
          </div>
        `);
        layerGroup.addLayer(shelterMarker);
      });
    }

    // 6. Render Resource Pre-positioning points
    if (showResources) {
      RESOURCE_PREPOSITIONS.filter(r => zones.some(z => z.id === r.zoneId)).forEach((res) => {
        const resIcon = L.divIcon({
          className: 'custom-resource-icon',
          html: `
            <div style="
              background: ${res.priority === 'CRITICAL' ? '#9333ea' : '#3b82f6'};
              border: 1px solid white;
              color: white;
              padding: 2px 5px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: bold;
              white-space: nowrap;
              box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            ">
              ⚡ ${res.type === 'dewatering_pump' ? 'Pump Unit' : res.type === 'ndrf_boat_unit' ? 'NDRF Boat' : 'SDRF Squad'} (${res.recommendedUnits})
            </div>
          `,
          iconSize: [60, 16],
        });

        const resMarker = L.marker(res.coordinates, { icon: resIcon });
        resMarker.bindPopup(`
          <div style="font-size: 11px; color: white;">
            <div style="font-weight: bold; color: #c084fc;">${res.name}</div>
            <div style="margin-top: 4px; color: #cbd5e1;">Target: <strong>${res.targetStreet}</strong></div>
            <div style="color: #94a3b8;">${res.reason}</div>
            <div style="margin-top: 4px; font-weight: bold; color: #34d399;">Status: ${res.status.toUpperCase()}</div>
          </div>
        `);
        layerGroup.addLayer(resMarker);
      });
    }

  }, [
    city,
    zones,
    selectedZone,
    simulationParams,
    show2015Historical,
    show2023Historical,
    showShelters,
    showDrains,
    showResources,
    showEvacRoutes,
  ]);

  // Handle Search Input & Pan Map
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapInstanceRef.current) return;

    const matchedZone = zones.find(z =>
      z.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      z.keyStreets.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (matchedZone) {
      onSelectZone(matchedZone);
      const coords = ZONE_COORDINATES[matchedZone.id];
      if (coords) {
        mapInstanceRef.current.setView(coords.center, 14, { animate: true });
      }
    }
  };

  return (
    <div className="fluid-glass rounded-[32px] overflow-hidden relative shadow-[0_24px_50px_rgba(0,0,0,0.65)] border border-cyan-500/25 flex flex-col" id="leaflet-flood-map-wrapper">
      {/* Top Map Control Bar */}
      <div className="p-3 sm:p-4 bg-slate-950/70 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <form onSubmit={handleSearch} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400/80" />
          <input
            type="text"
            placeholder="Search address (e.g. Velachery 100ft Rd)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 bg-slate-900/80 text-slate-100 pl-10 pr-4 rounded-full text-xs placeholder:text-slate-500 border border-slate-700/60 focus:outline-none focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/40 transition-all"
          />
        </form>

        {/* Layer Filter Toggles */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
          <button
            onClick={() => setShow2015Historical(!show2015Historical)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer shadow-sm ${
              show2015Historical
                ? 'bg-amber-500/25 border-amber-400 text-amber-300 font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                : 'bg-slate-800/60 hover:bg-slate-700/80 text-amber-300/80 border-amber-500/40 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 5a5 5 0 1 1-5 5 5 5 0 0 1 5-5z" />
              <circle cx="12" cy="12" fill="currentColor" r="2" />
            </svg>
            <span>2015 Deluge Overlay</span>
          </button>

          <button
            onClick={() => setShow2023Historical(!show2023Historical)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer shadow-sm ${
              show2023Historical
                ? 'bg-rose-500/25 border-rose-400 text-rose-300 font-bold shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                : 'bg-slate-800/60 hover:bg-slate-700/80 text-rose-300/80 border-rose-500/40 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 0 1 9.9 8.6c.1.7-.4 1.4-1.1 1.4h-3.8a5 5 0 0 0-5-5V3.2c0-.7-.7-1.2-1.4-1.1A10 10 0 0 1 12 2z" />
              <path d="M12 22a10 10 0 0 1-9.9-8.6c-.1-.7.4-1.4 1.1-1.4h3.8a5 5 0 0 0 5 5v3.8c0 .7.7 1.2 1.4 1.1A10 10 0 0 1 12 22z" />
              <circle cx="12" cy="12" fill="currentColor" r="2.5" />
            </svg>
            <span>2023 Michaung</span>
          </button>

          <button
            onClick={() => setShowEvacRoutes(!showEvacRoutes)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer shadow-sm ${
              showEvacRoutes
                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-slate-800/60 hover:bg-slate-700/80 text-emerald-300/80 border-emerald-400/40 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="18 15 22 15 22 11" />
              <path d="M14 9l8 6" />
              <path d="M4 19h4l4-8V4" />
              <polyline points="10 4 12 2 14 4" />
            </svg>
            <span>Evacuation Routes</span>
          </button>

          <button
            onClick={() => setShowShelters(!showShelters)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer shadow-sm ${
              showShelters
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'bg-slate-800/60 hover:bg-slate-700/80 text-cyan-300/80 border-cyan-400/40 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Relief Camps</span>
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative w-full h-[560px] bg-[#050b14]">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Real-time Scenario Slider (Floating Hydro Wave Slider) */}
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-md z-20 fluid-glass rounded-3xl p-4 shadow-2xl border border-emerald-400/25 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center text-emerald-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M2 12c3-4 6-4 9 0s6 4 9 0M2 17c3-4 6-4 9 0s6 4 9 0" />
                </svg>
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-wider">Hydro-Rainfall Scenario Slider</span>
            </div>
            <div className="bg-slate-900/80 border border-emerald-400/30 px-3 py-1 rounded-full flex items-baseline gap-1 shadow-inner">
              <span className="text-lg text-emerald-400 font-bold font-mono">
                {simulationParams.rainfallIntensityMmHr}
              </span>
              <span className="text-[11px] text-slate-400">mm/hr</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <input
              type="range"
              min="20"
              max="200"
              step="1"
              value={simulationParams.rainfallIntensityMmHr}
              onChange={(e) => onUpdateParams({ ...simulationParams, rainfallIntensityMmHr: Number(e.target.value) })}
              className="fluid-slider w-full"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span className="text-emerald-400">20mm (Moderate)</span>
              <span className="text-amber-400">80mm (Severe)</span>
              <span className="text-rose-400">150mm+ (2015 Deluge)</span>
            </div>
          </div>
        </div>

        {/* Legend Overlay */}
        <div className="absolute top-4 right-4 z-20 fluid-glass rounded-2xl p-3.5 w-64 shadow-2xl border border-slate-700/60 hidden sm:block">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Inundation Risk Tier</span>
            <span className="text-[10px] text-emerald-400 font-mono">MSL Rel.</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                <span className="text-slate-200 font-medium">Critical (&gt;60cm)</span>
              </div>
              <span className="font-mono text-rose-400 font-bold text-[11px]">ZONE A</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                <span className="text-slate-200 font-medium">High (30-60cm)</span>
              </div>
              <span className="font-mono text-amber-400 font-bold text-[11px]">ZONE B</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7]" />
                <span className="text-slate-200 font-medium">Moderate (15-30cm)</span>
              </div>
              <span className="font-mono text-purple-400 text-[11px] font-bold">ZONE C</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                <span className="text-slate-200 font-medium">Low / Passable (&lt;15cm)</span>
              </div>
              <span className="font-mono text-emerald-400 text-[11px] font-bold">SAFE</span>
            </div>
          </div>
        </div>

        {/* Footer GIS Attribution */}
        <div className="absolute bottom-2 right-4 z-20 text-[10px] text-slate-500 font-mono pointer-events-none">
          GIS Hydro Model v4.2 • CartoDB DarkMatter Vector • SRTM 30m DEM
        </div>
      </div>
    </div>
  );
};
