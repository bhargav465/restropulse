// Frontend Constants - Static Data Only
// All dynamic data (users, restaurants, posts, etc.) is now fetched from the backend API

// Area Chart Data (Engagement Pulse) - Static analytics sample data
export const INSIGHT_DATA = [
  { name: 'Week 1', engagement: 2400, posts: 3 },
  { name: 'Week 2', engagement: 1398, posts: 4 },
  { name: 'Week 3', engagement: 3800, posts: 2 },
  { name: 'Week 4', engagement: 4300, posts: 5 },
  { name: 'Week 5', engagement: 4800, posts: 4 }, // Current
];

// Donut Chart Data (Content Balance) - Static analytics sample data
export const CONTENT_MIX_DATA = [
    { name: 'Food & Menu', value: 45, color: '#f97316' }, // Orange-500
    { name: 'Offers', value: 30, color: '#a855f7' },      // Purple-500
    { name: 'BTS', value: 25, color: '#3b82f6' },         // Blue-500
];

// Theme Performance Data - Static analytics sample data
export const THEME_PERFORMANCE = [
    { category: 'Food & Menu', count: 7, label: 'Top Performer', type: 'HIGH', score: 92 },
    { category: 'Offers', count: 4, label: 'Average', type: 'MED', score: 65 },
    { category: 'BTS', count: 3, label: 'Trending', type: 'HIGH', score: 85 },
];
