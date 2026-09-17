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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative" id="leaflet-flood-map-wrapper">
      {/* Top Map Control Bar */}
      <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <form onSubmit={handleSearch} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search address (e.g. Velachery 100ft Rd)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </form>

        {/* Layer Filter Toggles */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
          <button
            onClick={() => setShow2015Historical(!show2015Historical)}
            className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center space-x-1 transition-all whitespace-nowrap ${
              show2015Historical
                ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {show2015Historical ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>2015 Deluge Overlay</span>
          </button>

          <button
            onClick={() => setShow2023Historical(!show2023Historical)}
            className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center space-x-1 transition-all whitespace-nowrap ${
              show2023Historical
                ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {show2023Historical ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>2023 Michaung</span>
          </button>

          <button
            onClick={() => setShowEvacRoutes(!showEvacRoutes)}
            className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center space-x-1 transition-all whitespace-nowrap ${
              showEvacRoutes
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Evacuation Routes</span>
          </button>

          <button
            onClick={() => setShowShelters(!showShelters)}
            className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center space-x-1 transition-all whitespace-nowrap ${
              showShelters
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Relief Camps</span>
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative w-full h-[520px] bg-slate-950">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Real-time Scenario Slider (Floating Demo Controller) */}
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-96 z-20 bg-slate-950/95 border border-slate-700/90 rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-cyan-400 text-xs font-bold uppercase tracking-wider">
              <Sliders className="w-4 h-4" />
              <span>Rainfall Scenario Slider (20 - 200mm)</span>
            </div>
            <span className="font-mono text-sm font-extrabold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
              {simulationParams.rainfallIntensityMmHr} mm/hr
            </span>
          </div>

          <input
            type="range"
            min="20"
            max="200"
            step="5"
            value={simulationParams.rainfallIntensityMmHr}
            onChange={(e) => onUpdateParams({ ...simulationParams, rainfallIntensityMmHr: Number(e.target.value) })}
            className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>20mm (Moderate)</span>
            <span>80mm (Severe)</span>
            <span>150mm+ (2015 Cloudburst)</span>
          </div>
        </div>

        {/* Legend Overlay */}
        <div className="absolute top-4 right-4 z-20 bg-slate-950/90 border border-slate-800 rounded-xl p-3 shadow-xl backdrop-blur-md hidden sm:block text-xs space-y-1.5">
          <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider mb-1">Inundation Risk Tier</div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded bg-rose-600 animate-pulse" />
            <span className="text-slate-200">Critical (&gt;60cm)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded bg-orange-500" />
            <span className="text-slate-200">High (30-60cm)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded bg-yellow-500" />
            <span className="text-slate-200">Moderate (15-30cm)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded bg-emerald-500" />
            <span className="text-slate-200">Low / Passable (&lt;15cm)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
