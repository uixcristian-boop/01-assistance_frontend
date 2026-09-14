import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pe.edu.ucss.assistance',
  appName: 'UCSS Assistance',
  webDir: 'dist/assistance_frontend/browser',
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
