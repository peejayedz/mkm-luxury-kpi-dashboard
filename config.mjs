// Dashboard settings. Safe to publish: no secrets here.
export const CONFIG = {
  locationId: 'PtwrHyjn0q6KqAQ9yffW',
  locationName: 'MKM Luxury',
  // The dashboard uses the time zone set on the GHL account (read on every sync).
  // This is only used if GHL doesn't return one.
  timezoneFallback: 'US/Eastern',
  ghlBaseUrl: 'https://app.unleashed-leads.com',
  kdfSalt: 'mkm-luxury-kpi-dashboard:v1',
  kdfIterations: 250000,
  sourceAliases: {
    'ppc launch': 'PPC Launch',
    'ppc': 'PPC Launch',
    'drive by': 'Drive By',
    'driveby': 'Drive By',
  },
};
