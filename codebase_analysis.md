# 📱 AgriArch — Frontend Codebase Analysis

## 🏗️ Project Overview

**AgriArch** is a smart farm / hydroponic management React Native app built with **Expo SDK 54 + Expo Router v6**. It connects to IoT devices in real time via MQTT over WebSockets, and to a custom REST API. The app manages sensors, actuators, crops, and alerts for precision agriculture.

---

## 🗂️ Directory Structure

```
MobileApp-Agri-Arch/
├── app/                         # Expo Router file-based routes
│   ├── _layout.jsx              # Root layout — context providers + auth guard
│   ├── index.jsx                # Branded splash screen
│   ├── onboarding.jsx           # Onboarding screen (hero image + CTAs)
│   ├── (auth)/                  # Public routes
│   │   ├── _layout.jsx
│   │   ├── login.jsx
│   │   ├── signup.jsx
│   │   ├── add_device.jsx
│   │   └── add_crops.jsx
│   └── (main)/                  # Protected routes (authenticated)
│       ├── _layout.jsx          # Drawer layout + custom header
│       ├── dashboard.jsx        # Main sensor dashboard
│       ├── system-control.jsx   # Actuator controls (pump, valves, AC)
│       ├── devices.jsx          # Device manager
│       ├── settings.jsx         # App settings
│       ├── profile.jsx          # User profile
│       ├── add_crops.jsx        # Crop management
│       ├── sensor-list.jsx      # Sensor listing
│       ├── sensor-tabs.jsx      # Sensor tabs navigation
│       ├── sensor-history.jsx   # Historical sensor data
│       ├── pump-history.jsx     # Pump operation history
│       ├── co2.jsx              # CO₂ specific view
│       ├── (tabs)/
│       │   └── pumps.tsx        # Pump sub-tabs
│       └── sensor/
│           ├── SensorDetailScreen.jsx  # Full sensor detail (chart + stats)
│           └── [type].jsx       # Dynamic route for each sensor type
├── components/                  # Reusable UI components
│   ├── BottomTabBar.jsx         # Custom animated tab bar
│   ├── AddDeviceWizard.jsx      # Multi-step device addition wizard
│   ├── AlertBadge.jsx           # Notification badge
│   ├── AlertList.jsx            # Alert feed list
│   ├── AppStatusBar.jsx         # Centralized status bar
│   ├── ConnectionStatusBanner.jsx  # MQTT connection banner
│   ├── DashboardHero.jsx        # Hero card on dashboard
│   ├── DeviceStatusSummary.jsx  # Device status summary card
│   ├── LineChart.jsx            # Custom SVG line chart
│   ├── LiveChartCard.jsx        # Live streaming chart card
│   ├── Logo.jsx                 # App logo
│   ├── SettingsSlider.jsx       # Timing slider control
│   ├── StatusDisplay.jsx        # Status display component
│   ├── SvgIcons.js              # All custom SVG icons (~39KB)
│   ├── ZoomableChart.jsx        # Zoomable historical chart
│   └── chat/                   # Chat UI components
├── src/
│   ├── config/
│   │   └── sensorConfigs.js     # Single source of truth for all sensors
│   ├── constants/
│   │   └── theme.ts             # Theme constants
│   ├── context/                 # React Context providers
│   │   ├── AuthContext.jsx      # Auth state + token management
│   │   ├── MqttContext.jsx      # MQTT state + real-time data (~92KB!)
│   │   ├── AlertContext.jsx     # Alert feed management
│   │   ├── NetworkContext.jsx   # Network connectivity monitoring
│   │   ├── SystemModeContext.jsx # Auto/Manual mode management
│   │   ├── HistoricalDataContext.jsx  # Historical data cache
│   │   ├── ScrollContext.jsx    # Scroll position management
│   │   └── ThemContext.tsx      # Light/dark theme
│   ├── hooks/
│   │   └── useLiveMqttWindow.js # Hook for live sliding-window chart data
│   ├── services/
│   │   ├── api.js               # Axios API client + interceptors
│   │   ├── mqttClient.js        # Low-level MQTT client (mqtt.js)
│   │   ├── senmlService.js      # SenML data format processing
│   │   ├── lastDataCache.js     # AsyncStorage-based last data cache
│   │   ├── add_crops/           # Crop CRUD service
│   │   ├── identify/            # Device identity service
│   │   ├── organization/        # Org management service
│   │   ├── profile/             # User profile service
│   │   ├── groups/              # Groups service
│   │   └── things/              # IoT "things" (device) service
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   └── utils/
│       ├── deviceStatusParser.js  # Device status flag parser
│       ├── senmlParser.js         # SenML message parser
│       └── sensorIconMapper.js    # Maps sensor keys to icons
```

---

## ⚙️ Tech Stack

| Category | Technology |
|---|---|
| Framework | **React Native 0.81.5** + **Expo SDK 54** |
| Routing | **Expo Router v6** (file-based, like Next.js) |
| Real-time | **MQTT.js 5** over WebSocket (custom `mqttClient.js`) |
| HTTP API | **Axios** with request/response interceptors |
| State | **React Context API** (8 contexts) |
| Storage | **AsyncStorage** |
| Auth | JWT tokens (decoded via `jwt-decode`) |
| Charts | Custom SVG (`react-native-svg`) |
| Navigation | Expo Router Drawer + custom bottom tab bar |
| Animations | React Native `Animated` API |
| Icons | `@expo/vector-icons` (Ionicons) + custom SVGs |
| Theme | Custom light/dark theme system |
| Network | `@react-native-community/netinfo` |

---

## 🌊 Data Flow

```
MQTT Broker (WebSocket)
        │
        ▼
mqttClient.js (low-level connection mgmt)
        │
        ▼
MqttContext.jsx (HUGE — 2665 lines, ~92KB)
   ├── sensorData          (live readings per device)
   ├── actuatorStatus      (pump/valve states)
   ├── deviceStatusFlags   (alert flags from device)
   ├── cropSettings        (crop thresholds)
   ├── deviceConfig        (report/sample intervals)
   ├── selectedExternalKey (active device)
   └── publishConfig()     (send commands to device)
        │
        ├──▶ SystemModeContext (Auto/Manual mode)
        ├──▶ AlertContext      (alert feed)
        └──▶ All screens that consume useMqtt()
```

---

## 🔐 Auth Flow

```
App Launch
    │
    ▼
index.jsx (splash screen, 2.2s animation)
    │
    ├─ isSignupFlow? ──▶ /(auth)/add_device
    ├─ isAuthenticated? ──▶ /(main)/dashboard
    └─ else ──▶ /onboarding
                    │
                    ├─ Get Started ──▶ /(auth)/signup
                    └─ Sign In ──▶ /(auth)/login
```

**Token Management (AuthContext):**
- JWT stored in AsyncStorage (`authToken`)
- Decoded with `jwt-decode` to check expiry
- Periodic check every 60s
- Foreground re-validation on AppState change
- 401 interceptor in Axios → auto-logout

---

## 🗺️ Navigation Architecture

The app uses **Expo Router's file-based routing**:

1. **Root Stack** (`app/_layout.jsx`): Wraps everything in the context provider tree, implements auth guard via `useSegments()`.
2. **Drawer Layout** (`app/(main)/_layout.jsx`): Custom drawer + custom bottom tab bar via `BottomTabBar.jsx`. Uses `@react-navigation/drawer`.
3. **Bottom Tabs**: Dashboard, Control, Crops, Devices, Settings.
4. **Auth routes** (`app/(auth)/`): Login, Signup, Add Device, Add Crops — accessible during signup flow even when token exists.

**Special navigation logic:**
- App reopen on device/chart screen → redirects to dashboard after 3s gap
- Signup flow flag: lets authenticated user go through onboarding (add device → add crops)

---

## 📦 Context Provider Tree

```
GestureHandlerRootView
  └── SafeAreaProvider
        └── ThemeProvider
              └── NetworkProvider      ← offline modal
                    └── AuthProvider  ← JWT auth
                          └── MqttProvider  ← real-time data
                                └── SystemModeProvider  ← auto/manual
                                      └── AlertProvider  ← alerts
                                            └── HistoricalDataProvider
                                                  └── RootNav (routes)
```

---

## 📡 MQTT Architecture

### mqttClient.js (service layer)
- Manages WebSocket connection to broker
- Uses stable device ID (`expo-application` → `getAndroidId`)
- Password = `external_key` from AsyncStorage
- `reconnectPeriod: 3000` for auto-reconnect
- Up to 10 reconnect attempts
- Exposes: `getMqttClient`, `isMqttConnected`, `publishWithRetry`, `disconnectMqtt`, `reconnectMqtt`, `onMqttConnectionChange`

### MqttContext.jsx (business logic — 2665 lines)
- Multi-device support: maintains per-device state maps
- `selectedExternalKey` = currently active device
- SenML message parsing for sensor data
- Publishes config/control messages to device topics
- Handles initial data load status per device

---

## 🌿 Sensor System

### Sensors tracked (from `sensorConfigs.js`)
| Key | Data Key | Unit | Color |
|---|---|---|---|
| ambient-temperature | ambientTemperature | °C | #FF5722 |
| ambient-humidity | ambientHumidity | % | #2196F3 |
| co2 | co2Level | ppm | #9C27B0 |
| light-level | lightLevel | lux | #FFC107 |
| ph-level | phValue | pH | #4CAF50 |
| ec-value | ecValue | mS/cm | #00BCD4 |
| water-temperature | waterTemperature | °C | #03A9F4 |
| water-level | waterLevel | % | #2E7D32 |
| soil-moisture | soilMoisture | % | #8D6E63 |
| device-status | deviceStatus | — | #4CAF50 |

### Actuators
- `water_pump` — with on-time and interval settings
- `water_ILvalve` (Inlet Valve)
- `water_OLvalve` (Outlet Valve)
- `nutrient_pump` — with duration and on-time settings
- `ac_stat` (AC/Cooling)
- `buzzer`

---

## 🚨 Alert System (AlertContext)

Three alert types:
1. **Sensor alerts** (persistent while condition is true): Tank Low/High, EC, pH, Light, CO₂, Water Temp, Air Temp, Humidity, Sensor Fault
2. **Actuator alerts** (logged on state change): Pump ON/OFF, Valve OPEN/CLOSED, AC, Buzzer
3. **Mode change alerts**: Auto ↔ Manual mode transitions

Alerts capped at 50 items. Displayed in `AlertList.jsx` with badge in custom header.

---

## 🎨 UI/Design Patterns

### Theming
- Custom `ThemContext.tsx` with `light`/`dark` variants
- Colors: primary green (`#4CAF50`), dark green (`#2E7D32`), deep green (`#1B5E20`)
- Theme-aware components throughout

### Animations used
- **Splash screen**: fade-in + slide-up + pulsing ring halo + progress bar
- **Onboarding**: fade + slide-up on mount
- **Bottom tab bar**: spring animations on tab switch, icon scale on press
- **Custom header**: scroll-aware behavior via `ScrollContext`

### Components highlight
- `SvgIcons.js` (~39KB) — all IoT-related custom SVG icons
- `LiveChartCard.jsx` — live streaming chart with sliding window
- `ZoomableChart.jsx` — pinch-to-zoom historical chart
- `AddDeviceWizard.jsx` (~46KB) — multi-step device provisioning wizard
- `SettingsSlider.jsx` — timing slider for pump/actuator configuration

---

## ⚠️ Issues & Observations

### 🔴 Critical
1. **MqttContext.jsx is 2665 lines / ~92KB** — Way too large. It handles connection, state, parsing, device management, and publishing all in one file. This is a God Object and a maintainability risk.
2. **`deleteThing` and `getAllThingsFromApi` live in `AuthContext`** — These are not auth concerns. They belong in a `things` service.
3. **Duplicate auth storage in `api.js`** — `loginUser` writes to AsyncStorage AND AuthContext also writes. Dual write → potential sync issues.

### 🟡 Medium
4. **Mixed JS and TS** — The project is mostly JSX with some `.tsx` files (types, theme). TypeScript is configured but barely used — you lose type safety.
5. **`clearAuth()` is duplicated** — Both `AuthContext.clearAuth()` and `api.js` interceptor do their own key removal. The key lists could drift.
6. **`console.log` left in production paths** — Heavy logging in `AuthContext`, `MqttContext`, `mqttClient.js` — should be stripped for production or behind a debug flag.
7. **`useAuth()` is used inside `(main)/_layout.jsx` as `{ user }` but `user` is not exported from AuthContext** — Only `token` is in the context value.

### 🟢 Well Done
- Clean Expo Router auth guard pattern in `app/_layout.jsx`
- Proper AppState handling for foreground token re-validation
- Stable MQTT client ID (using device hardware ID)
- `sensorConfigs.js` as a single source of truth for all sensors
- Custom bottom tab bar with spring animations
- Network modal for offline detection
- SenML message format — aligns with IoT standards
- `publishWithRetry` for resilient MQTT publishing

---

## 📊 File Size Summary (large files to watch)

| File | Lines | Size |
|---|---|---|
| `src/context/MqttContext.jsx` | 2665 | 92 KB |
| `components/SvgIcons.js` | ~1500+ | 39 KB |
| `components/AddDeviceWizard.jsx` | ~1000+ | 46 KB |
| `app/(main)/system-control.jsx` | 1128 | 45 KB |
| `app/(main)/_layout.jsx` | 1156 | 38 KB |
| `app/(main)/dashboard.jsx` | 1067 | 37 KB |
| `app/(auth)/add_crops.jsx` | ~1500+ | 67 KB |

---

## 🗺️ Screens Summary

| Screen | Route | Purpose |
|---|---|---|
| Splash | `/` | Branded launch screen |
| Onboarding | `/onboarding` | First-time landing with CTA |
| Login | `/(auth)/login` | Email + password login |
| Signup | `/(auth)/signup` | New user registration |
| Add Device | `/(auth)/add_device` | IoT device provisioning |
| Add Crops (auth) | `/(auth)/add_crops` | First crop setup |
| Dashboard | `/(main)/dashboard` | Live sensor grid |
| System Control | `/(main)/system-control` | Actuator controls |
| Devices | `/(main)/devices` | Device list + switch |
| Settings | `/(main)/settings` | App configuration |
| Profile | `/(main)/profile` | User profile |
| Add Crops | `/(main)/add_crops` | Crop management |
| Sensor Detail | `/(main)/sensor/[type]` | Per-sensor chart + history |
| Pump History | `/(main)/pump-history` | Pump operation log |
| CO₂ | `/(main)/co2` | CO₂ detail view |
