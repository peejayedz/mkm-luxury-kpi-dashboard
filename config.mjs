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
  // Used only if the token can't read GHL Users (users scope missing). Keep in sync with GHL → Settings → Users.
  knownUsers: [
    { id: 'P7IJs6GdO0juFkimPprn', name: 'Angeli Magat' },
    { id: 'Wpp2JZ1ewqIqHIMhh2UW', name: 'Annemarie Lee' },
    { id: 'kJUTrZjENI7hY6Nxeggz', name: 'Christian Collins' },
    { id: 'oNSdqhkniqCxll31H3ND', name: 'Kristi Michael' },
    { id: 'tbRLBAsNTVfjZ2UdHoGR', name: 'Mario Michael' },
    { id: 'mHyQQ2PAwUU1GD8T3APS', name: 'PJ Edrozo' },
    { id: '8dYA5I0AVYBkfOlCvYRb', name: 'Soheela Ahsan' },
  ],
  sourceAliases: {
    'ppc launch': 'PPC Launch',
    'ppc': 'PPC Launch',
    'drive by': 'Drive By',
    'driveby': 'Drive By',
  },
};
