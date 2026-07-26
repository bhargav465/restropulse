import React from 'react';
import { Restaurant } from '@restropulse/shared';
import IntelligenceV2 from './v2/IntelligenceV2';
import type { DeepLinkTarget } from './v2/intelligence/deep-links';

interface IntelligenceProps {
  restaurant: Restaurant;
  /** Deep-link handler from the report's "Fix / Act on this" CTAs. */
  onNavigate?: (target: DeepLinkTarget) => void;
}

/**
 * Restaurant Intelligence page -- thin wrapper mounting the ported v2
 * two-bucket dashboard (RestroScore + My Restaurant + Competition). Runs on the
 * in-memory demo twin in P1; the real backend client arrives in P2.
 */
const Intelligence: React.FC<IntelligenceProps> = ({ restaurant, onNavigate }) => {
  return <IntelligenceV2 restaurantData={restaurant} onNavigate={onNavigate} />;
};

export default Intelligence;
