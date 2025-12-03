import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TripPosition } from "@/types/portal";

// Fix for default markers in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const originIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const destinationIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface TripMapProps {
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  origin?: string | null;
  destination?: string | null;
  positions?: TripPosition[];
}

const FitBounds = ({ positions, startLat, startLng, endLat, endLng }: {
  positions?: TripPosition[];
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
}) => {
  const map = useMap();

  useEffect(() => {
    const bounds: L.LatLngExpression[] = [];

    if (positions && positions.length > 0) {
      positions.forEach(p => bounds.push([p.latitude, p.longitude]));
    } else {
      if (startLat && startLng) bounds.push([startLat, startLng]);
      if (endLat && endLng) bounds.push([endLat, endLng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
    }
  }, [map, positions, startLat, startLng, endLat, endLng]);

  return null;
};

export const TripMap = ({
  startLat,
  startLng,
  endLat,
  endLng,
  origin,
  destination,
  positions,
}: TripMapProps) => {
  const hasStart = startLat && startLng;
  const hasEnd = endLat && endLng;
  const hasPositions = positions && positions.length > 0;

  // Default center (Brazil)
  const defaultCenter: L.LatLngExpression = hasStart 
    ? [startLat!, startLng!] 
    : [-15.7801, -47.9292];

  if (!hasStart && !hasEnd && !hasPositions) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted rounded-lg">
        <p className="text-muted-foreground">Sem dados de localização</p>
      </div>
    );
  }

  const polylinePositions: L.LatLngExpression[] = hasPositions
    ? positions.map(p => [p.latitude, p.longitude] as L.LatLngExpression)
    : hasStart && hasEnd
    ? [[startLat!, startLng!], [endLat!, endLng!]]
    : [];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      className="h-full w-full rounded-lg"
      style={{ minHeight: "400px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds
        positions={positions}
        startLat={startLat}
        startLng={startLng}
        endLat={endLat}
        endLng={endLng}
      />

      {hasStart && (
        <Marker position={[startLat!, startLng!]} icon={originIcon}>
          <Popup>
            <strong>Origem</strong>
            <br />
            {origin || `${startLat?.toFixed(6)}, ${startLng?.toFixed(6)}`}
          </Popup>
        </Marker>
      )}

      {hasEnd && (
        <Marker position={[endLat!, endLng!]} icon={destinationIcon}>
          <Popup>
            <strong>Destino</strong>
            <br />
            {destination || `${endLat?.toFixed(6)}, ${endLng?.toFixed(6)}`}
          </Popup>
        </Marker>
      )}

      {polylinePositions.length > 1 && (
        <Polyline
          positions={polylinePositions}
          color="#00662c"
          weight={4}
          opacity={0.8}
        />
      )}
    </MapContainer>
  );
};
