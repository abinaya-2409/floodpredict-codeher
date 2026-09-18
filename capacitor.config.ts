import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.floodypredict.app',
  appName: 'FloodyPredict',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    BluetoothChat: {
      serviceUUID: '0000fd01-0000-1000-8000-00805f9b34fb',
    },
  },
};

export default config;
