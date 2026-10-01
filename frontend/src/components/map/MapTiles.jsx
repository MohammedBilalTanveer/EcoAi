import { TileLayer } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_URL } from '../../lib/geo';

/**
 * Keyless OpenStreetMap tiles, darkened with a CSS filter to match the UI.
 * OSM blocks tile requests without a Referer ("403 Access blocked"), so each
 * tile explicitly sends our origin regardless of the page's referrer policy.
 */
export default function MapTiles() {
  return (
    <TileLayer
      url={TILE_URL}
      attribution={TILE_ATTRIBUTION}
      className="map-tiles-dark"
      maxZoom={19}
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
