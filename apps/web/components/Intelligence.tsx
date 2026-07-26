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
  // Mobile horizontal gutter so cards don't touch the viewport edges. Layout
  // supplies desktop gutters (lg:px-6), so we drop ours at lg to avoid doubling.
  return (
    <div className="px-4 pt-4 lg:px-0 lg:pt-0">
      <IntelligenceV2 restaurantData={restaurant} onNavigate={onNavigate} />
    </div>
  );
};

export default Intelligence;
