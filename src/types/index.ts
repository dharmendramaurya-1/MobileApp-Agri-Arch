export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Device {
  id: string;
  name: string;
  type: 'sensor' | 'plug' | 'pump' | 'air';
  status: 'online' | 'offline';
  room: string;
  temperature?: number;
  humidity?: number;
  soilMoisture?: number;
  airQuality?: string;
  isOn?: boolean;
  lastUpdated: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}