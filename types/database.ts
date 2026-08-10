export type FuelProduct =
  | 'gasoline_regular'
  | 'gasoline_premium'
  | 'gasoline_super'
  | 'kerosene'
  | 'gas'
  | 'lpg'
  | 'white_oil';

export type TrafficLevel = 'green' | 'yellow' | 'red';
export type StationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type StationKind = 'private' | 'government';

export interface Station {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  city: string;
  kind: StationKind;
  contact_name: string;
  phone: string;
  lat: number;
  lng: number;
  slug: string;
  status: StationStatus;
  opens_at: string;
  closes_at: string;
  is_24h: boolean;
  temp_closed: boolean;
  manual_traffic_level: TrafficLevel | null;
  manual_traffic_set_at: string | null;
  created_at: string;
}

export interface StationProduct {
  station_id: string;
  product: FuelProduct;
  is_available: boolean;
  expected_at: string | null; // ISO date: announced arrival for an unavailable product
  expected_period: 'morning' | 'afternoon' | 'evening' | null;
  updated_at: string;
}

export interface StationTrafficAvg {
  station_id: string;
  green_votes: number;
  yellow_votes: number;
  red_votes: number;
  total_votes: number;
  majority_level: TrafficLevel | null;
  last_vote_at: string | null;
}

/** Congestion for one pump line. Kept separate from the whole-station average
 *  because that average hides the case the driver cares about: a queue for
 *  premium while the regular pump is free. */
export interface ProductTraffic {
  station_id: string;
  product: FuelProduct;
  total_votes: number;
  last_vote_at: string | null;
  majority_level: TrafficLevel | null;
}

/** The three lanes a station actually queues at. */
export const TRAFFIC_PRODUCTS: FuelProduct[] = [
  'gasoline_premium',
  'gasoline_regular',
  'kerosene',
];

// what the home page actually renders per card
export interface StationWithStatus extends Station {
  products: StationProduct[];
  traffic: StationTrafficAvg | null;
  productTraffic: ProductTraffic[];
  distanceKm?: number; // only set once the user grants location
}
