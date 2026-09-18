// src/components/SvgIcons.js
//
// Flat-illustration icon set for the hydroponics/grow-system dashboard.
// Every icon shares the same API: { active, size, color, status }
//   - active: true = full color, false = greyed out (idle/off state)
//   - size:   pixel size of the badge (default 40, matches original set)
//   - color:  optional override of the accent color
//   - status: 'normal' | 'high' | 'low' — drives the little corner dot
//
// Import whatever you need, e.g.:
//   import { WaterPumpIcon, InletValveIcon, WaterTankIcon } from './SvgIcons';

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Rect
} from 'react-native-svg';

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
    opacity: 0.5,
  },
  statusDot: {},
});

// Muted (inactive) palette — every icon falls back to these three shades
// when `active` is false, so the whole set stays visually consistent.
const GREY = { light: '#EEEEEE', mid: '#E0E0E0', dark: '#BDBDBD' };

// Returns a { light, mid, dark } trio: real colors when active, grey when not.
const shades = (active, light, mid, dark) => (active ? { light, mid, dark } : GREY);

// Small helper to render the status/on-off dot in the top-right corner,
// same visual language as the original set.
const CornerDot = ({ active, status = 'normal' }) => {
  if (!active) return null;
  const fill =
    status === 'high' ? '#F44336' : status === 'low' ? '#2196F3' : '#4CAF50';
  return <Circle cx="20" cy="4" r="2.5" fill={fill} />;
};

// Small ON/OFF switch/pill badge for actuators (pumps, valves, etc.),
// drawn in the bottom-right corner so it never collides with CornerDot
// (which sits top-right for sensor status).
const PowerBadge = ({ active }) => {
  const track = active ? '#4CAF50' : '#BDBDBD';
  const knobX = active ? 19.6 : 16.9;
  return (
    <>
      <Rect x="15" y="17.2" width="6.2" height="3.4" rx="1.7" fill={track} stroke="#FFFFFF" strokeWidth="0.6" />
      <Circle cx={knobX} cy="18.9" r="1.3" fill="#FFFFFF" />
    </>
  );
};

// Shared badge wrapper — transparent by default, sized to match icon, dark/light theme safe
const IconBadge = ({ size = 40, active, tint, bg, children }) => {
  const backgroundColor = bg !== undefined ? bg : 'transparent';
  return (
    <View style={[styles.iconContainer, { width: size, height: size, backgroundColor }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {children}
      </Svg>
    </View>
  );
};

// ═══════════════════════════════════════════════
// ACTUATORS / CONTROLS
// ═══════════════════════════════════════════════

// ─── WATER PUMP ───
export const WaterPumpIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const s = shades(active, '#90CAF9', '#1E88E5', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="6" y="10" width="12" height="9" rx="2" fill={s.mid} />
      <Rect x="6" y="10" width="12" height="4" rx="2" fill={s.light} />
      <Rect x="9" y="5" width="6" height="6" rx="1.5" fill={s.dark} />
      <Circle cx="12" cy="14.5" r="2.5" fill={s.light} />
      <Path d="M12 13 C12 13 10.7 14.5 10.7 15.5 C10.7 16.3 11.3 17 12 17 C12.7 17 13.3 16.3 13.3 15.5 C13.3 14.5 12 13 12 13Z" fill={s.dark} />
      <Rect x="4" y="19" width="16" height="1.6" rx="0.8" fill={s.dark} />
      <CornerDot active={active} status={status} />
      <PowerBadge active={active} />
    </IconBadge>
  );
};

// ─── INLET VALVE ───
export const InletValveIcon = ({ active = true, size = 40, color = '#4CAF50', status = 'normal' }) => {
  const pipe = shades(active, '#CFD8DC', '#90A4AE', '#546E7A');
  const wheel = shades(active, '#A5D6A7', '#4CAF50', '#2E7D32');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="2" y="10.5" width="8" height="3" rx="1" fill={pipe.mid} />
      <Rect x="14" y="10.5" width="8" height="3" rx="1" fill={pipe.mid} />
      <Rect x="9" y="8" width="6" height="8" rx="1.5" fill={pipe.dark} />
      <Circle cx="12" cy="6" r="3.2" fill={wheel.mid} />
      <Circle cx="12" cy="6" r="1.3" fill={wheel.dark} />
      <Path d="M12 3 L12 4.5 M12 7.5 L12 9 M9 6 L10.5 6 M13.5 6 L15 6" stroke={wheel.dark} strokeWidth="1.2" strokeLinecap="round" />
      <Line x1="12" y1="9" x2="12" y2="8" stroke={wheel.dark} strokeWidth="1.5" />
      <CornerDot active={active} status={status} />
      <PowerBadge active={active} />
    </IconBadge>
  );
};

// ─── SOLENOID VALVE ───
export const SolenoidValveIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const pipe = shades(active, '#CFD8DC', '#90A4AE', '#546E7A');
  const coil = shades(active, '#90CAF9', '#1E88E5', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="2" y="12" width="8" height="3" rx="1" fill={pipe.mid} />
      <Rect x="14" y="12" width="8" height="3" rx="1" fill={pipe.mid} />
      <Rect x="8" y="10.5" width="8" height="6" rx="1.5" fill={pipe.dark} />
      <Rect x="9" y="4" width="6" height="7" rx="1.5" fill={coil.mid} />
      <Path d="M9.5 5.5 L14.5 5.5 M9.5 7 L14.5 7 M9.5 8.5 L14.5 8.5" stroke={coil.dark} strokeWidth="0.9" />
      <Rect x="10.5" y="2" width="3" height="2.2" rx="0.6" fill={coil.dark} />
      <CornerDot active={active} status={status} />
      <PowerBadge active={active} />
    </IconBadge>
  );
};

// ─── OUTLET VALVE (TAP) ───
export const OutletValveIcon = ({ active = true, size = 40, color = '#26A69A', status = 'normal' }) => {
  const pipe = shades(active, '#CFD8DC', '#90A4AE', '#546E7A');
  const tap = shades(active, '#80CBC4', '#26A69A', '#00695C');
  const drop = shades(active, '#B3E5FC', '#4FC3F7', '#0288D1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="2" y="6" width="8" height="4" rx="1" fill={pipe.mid} />
      <Rect x="8" y="4" width="6" height="8" rx="1.5" fill={pipe.dark} />
      <Rect x="10" y="10" width="4" height="4" rx="1" fill={tap.mid} />
      <Path d="M12 14 C12 14 9.5 17.5 9.5 19 C9.5 20.4 10.6 21.5 12 21.5 C13.4 21.5 14.5 20.4 14.5 19 C14.5 17.5 12 14 12 14Z" fill={drop.mid} />
      <Ellipse cx="11.2" cy="18.3" rx="0.8" ry="1.1" fill={drop.light} opacity="0.8" />
      <CornerDot active={active} status={status} />
      <PowerBadge active={active} />
    </IconBadge>
  );
};

// ─── GROW LIGHT ───
export const GrowLightIcon = ({ active = true, size = 40, color = '#FFC107', status = 'normal' }) => {
  const fixture = shades(active, '#B0BEC5', '#607D8B', '#37474F');
  const beam = shades(active, '#FFECB3', '#FFC107', '#FF8F00');
  const plant = shades(active, '#A5D6A7', '#4CAF50', '#2E7D32');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M6 4 L18 4 L15 8 L9 8 Z" fill={fixture.dark} />
      <Path d="M9 8 L15 8 L18 17 L6 17 Z" fill={beam.light} opacity="0.55" />
      <Path d="M9 8 L15 8 L13.5 8 L10.5 8 Z" fill={beam.mid} />
      <Path d="M12 12 C12 12 9.5 13.3 9.5 15.2 C9.5 16.7 10.6 17.8 12 17.8 C13.4 17.8 14.5 16.7 14.5 15.2 C14.5 13.3 12 12 12 12Z" fill={plant.mid} />
      <Path d="M12 20.5 L12 17.5 M12 18.5 C12 18.5 10.3 17.7 10 16.5 M12 18.5 C12 18.5 13.7 17.7 14 16.5" stroke={plant.dark} strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── EXHAUST FAN ───
export const ExhaustFanIcon = ({ active = true, size = 40, color = '#455A64', status = 'normal' }) => {
  const body = shades(active, '#CFD8DC', '#90A4AE', '#455A64');
  const air = shades(active, '#B3E5FC', '#4FC3F7', '#0288D1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="3" y="3" width="14" height="14" rx="2.5" fill={body.dark} />
      <Circle cx="10" cy="10" r="5" fill={body.mid} />
      <Path d="M10 10 C10 10 10.5 6.5 12.5 6 C13.5 5.8 14 6.8 13.5 7.6 C12.7 8.9 10 10 10 10Z" fill={body.light} />
      <Path d="M10 10 C10 10 13.5 10.5 14 12.5 C14.2 13.5 13.2 14 12.4 13.5 C11.1 12.7 10 10 10 10Z" fill={body.light} />
      <Path d="M10 10 C10 10 6.5 9.5 6 7.5 C5.8 6.5 6.8 6 7.6 6.5 C8.9 7.3 10 10 10 10Z" fill={body.light} />
      <Circle cx="10" cy="10" r="1.4" fill={body.dark} />
      <Path d="M17 8 C19 8 20 9.5 20 11 M18 12 C19.6 12 20.5 13.2 20.5 14.5" stroke={air.mid} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── NUTRIENT DOSER ───
export const NutrientDoserIcon = ({ active = true, size = 40, color = '#43A047', status = 'normal' }) => {
  const body = shades(active, '#A5D6A7', '#43A047', '#1B5E20');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="6" y="6" width="9" height="12" rx="2" fill={body.mid} />
      <Rect x="6" y="6" width="9" height="4" rx="2" fill={body.light} />
      <Circle cx="10.5" cy="12" r="1.6" fill={body.dark} />
      <Rect x="14.5" y="9" width="6" height="2" rx="1" fill={body.dark} transform="rotate(20 14.5 9)" />
      <Circle cx="19.5" cy="12" r="1" fill={body.dark} />
      <Rect x="9" y="19" width="3" height="2" rx="0.6" fill={body.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── AIR PUMP ───
export const AirPumpIcon = ({ active = true, size = 40, color = '#1976D2', status = 'normal' }) => {
  const body = shades(active, '#90CAF9', '#1976D2', '#0D47A1');
  const bubble = shades(active, '#E1F5FE', '#81D4FA', '#4FC3F7');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="4" y="9" width="12" height="8" rx="4" fill={body.mid} />
      <Ellipse cx="8" cy="12" rx="2.4" ry="2.6" fill={body.light} opacity="0.6" />
      <Circle cx="17.5" cy="7" r="1.3" fill={bubble.mid} />
      <Circle cx="20" cy="9.5" r="1.7" fill={bubble.mid} />
      <Circle cx="19" cy="13" r="1" fill={bubble.mid} />
      <Rect x="9" y="17" width="3" height="2.5" rx="0.6" fill={body.dark} />
      <CornerDot active={active} status={status} />
      <PowerBadge active={active} />
    </IconBadge>
  );
};

// ─── HEATER ───
export const HeaterIcon = ({ active = true, size = 40, color = '#455A64', status = 'normal' }) => {
  const body = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  const heat = shades(active, '#FFCCBC', '#FF7043', '#D84315');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="5" y="3" width="14" height="18" rx="2.5" fill={body.mid} />
      <Path d="M8 8 C8 8 7 10 8 11.5 C9 13 8 14.5 8 14.5" stroke={heat.mid} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <Path d="M12 8 C12 8 11 10 12 11.5 C13 13 12 14.5 12 14.5" stroke={heat.mid} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <Path d="M16 8 C16 8 15 10 16 11.5 C17 13 16 14.5 16 14.5" stroke={heat.mid} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <Circle cx="12" cy="18" r="1.3" fill={body.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── CHILLER ───
export const ChillerIcon = ({ active = true, size = 40, color = '#607D8B', status = 'normal' }) => {
  const body = shades(active, '#CFD8DC', '#90A4AE', '#455A64');
  const snow = shades(active, '#E1F5FE', '#4FC3F7', '#0288D1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="4" y="3" width="16" height="18" rx="2.5" fill={body.mid} />
      <Rect x="4" y="3" width="16" height="6" rx="2.5" fill={body.light} opacity="0.5" />
      <Path d="M12 8 L12 16 M9 9.5 L15 14.5 M15 9.5 L9 14.5" stroke={snow.mid} strokeWidth="1.4" strokeLinecap="round" />
      <Circle cx="7" cy="19" r="1" fill={body.dark} />
      <Circle cx="10" cy="19" r="1" fill={body.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── HUMIDIFIER ───
export const HumidifierIcon = ({ active = true, size = 40, color = '#4FC3F7', status = 'normal' }) => {
  const body = shades(active, '#ECEFF1', '#CFD8DC', '#90A4AE');
  const mist = shades(active, '#B3E5FC', '#4FC3F7', '#0288D1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M7 21 L7 12 C7 8 9 6 12 6 C15 6 17 8 17 12 L17 21 Z" fill={body.mid} />
      <Circle cx="12" cy="6" r="1.6" fill={body.dark} />
      <Path d="M9 3.5 C9 3.5 9.5 4.5 9.5 5.2 M12 2.5 C12 2.5 12.5 3.7 12.5 4.5 M15 3.5 C15 3.5 15.5 4.5 15.5 5.2" stroke={mist.mid} strokeWidth="1.3" strokeLinecap="round" />
      <Circle cx="12" cy="15" r="2.4" fill={mist.mid} opacity="0.9" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── CO2 REGULATOR ───
export const Co2RegulatorIcon = ({ active = true, size = 40, color = '#43A047', status = 'normal' }) => {
  const body = shades(active, '#A5D6A7', '#43A047', '#1B5E20');
  const gauge = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="8" y="8" width="8" height="13" rx="2.5" fill={body.mid} />
      <Rect x="9.5" y="4.5" width="5" height="4" rx="1" fill={body.dark} />
      <Circle cx="16" cy="8" r="3" fill={gauge.mid} />
      <Circle cx="16" cy="8" r="1.1" fill={gauge.dark} />
      <Path d="M16 8 L17.3 6.8" stroke={gauge.dark} strokeWidth="0.9" strokeLinecap="round" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ═══════════════════════════════════════════════
// TANKS / CONTAINERS
// ═══════════════════════════════════════════════

// ─── WATER TANK ───
export const WaterTankIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const tank = shades(active, '#90CAF9', '#1E88E5', '#0D47A1');
  const stand = shades(active, '#B0BEC5', '#607D8B', '#37474F');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="6" y="3" width="12" height="13" rx="2" fill={tank.mid} />
      <Rect x="6" y="9" width="12" height="7" rx="2" fill={tank.dark} />
      <Path d="M12 6 C12 6 10.3 8 10.3 9.3 C10.3 10.2 11.1 11 12 11 C12.9 11 13.7 10.2 13.7 9.3 C13.7 8 12 6 12 6Z" fill={tank.light} />
      <Path d="M7 17 L7 21 M17 17 L17 21 M6 21 L18 21" stroke={stand.dark} strokeWidth="1.4" strokeLinecap="round" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── NUTRIENT TANK ───
export const NutrientTankIcon = ({ active = true, size = 40, color = '#43A047', status = 'normal' }) => {
  const tank = shades(active, '#A5D6A7', '#43A047', '#1B5E20');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="6" y="3" width="12" height="16" rx="2" fill={tank.mid} />
      <Rect x="6" y="10" width="12" height="9" rx="2" fill={tank.dark} />
      <Path d="M12 6.5 C12 6.5 9.5 8.5 9.5 10.5 C9.5 11.9 10.6 13 12 13 C13.4 13 14.5 11.9 14.5 10.5 C14.5 8.5 12 6.5 12 6.5Z" fill={tank.light} />
      <Rect x="9" y="20" width="6" height="1.6" rx="0.8" fill={tank.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── MIXING TANK ───
export const MixingTankIcon = ({ active = true, size = 40, color = '#29B6F6', status = 'normal' }) => {
  const tank = shades(active, '#B3E5FC', '#29B6F6', '#0277BD');
  const stir = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="5" y="6" width="14" height="14" rx="2.5" fill={tank.mid} />
      <Path d="M5 9 L19 9 M5 12 L19 12 M5 15 L19 15" stroke={tank.light} strokeWidth="1.3" opacity="0.7" />
      <Rect x="11" y="2" width="2" height="8" rx="1" fill={stir.dark} />
      <Path d="M9 8 C9 8 11 9.5 12 9.5 C13 9.5 15 8 15 8" stroke={stir.dark} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── RESERVOIR ───
export const ReservoirIcon = ({ active = true, size = 40, color = '#29B6F6', status = 'normal' }) => {
  const glass = shades(active, '#ECEFF1', '#CFD8DC', '#90A4AE');
  const liquid = shades(active, '#B3E5FC', '#29B6F6', '#0277BD');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M7 4 L17 4 L17 11 L20 20 C20.3 20.8 19.7 21.5 18.9 21.5 L5.1 21.5 C4.3 21.5 3.7 20.8 4 20 L7 11 Z" fill={glass.mid} opacity="0.5" />
      <Path d="M5.6 20.5 L18.4 20.5 L16.6 14.5 L7.4 14.5 Z" fill={liquid.mid} />
      <Rect x="6.5" y="3" width="11" height="1.6" rx="0.8" fill={glass.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── DRUM / BARREL ───
export const DrumIcon = ({ active = true, size = 40, color = '#1565C0', status = 'normal' }) => {
  const drum = shades(active, '#90CAF9', '#1565C0', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M5 6 C5 4.5 8.1 3.5 12 3.5 C15.9 3.5 19 4.5 19 6 L19 18 C19 19.5 15.9 20.5 12 20.5 C8.1 20.5 5 19.5 5 18 Z" fill={drum.mid} />
      <Ellipse cx="12" cy="6" rx="7" ry="2" fill={drum.light} />
      <Rect x="5" y="10.5" width="14" height="1.6" fill={drum.dark} />
      <Path d="M11 14 C11 14 9.7 15.5 9.7 16.5 C9.7 17.3 10.3 18 11 18 M11 14 C11 14 12.3 15.5 12.3 16.5 C12.3 17.3 11.7 18 11 18" fill={drum.light} opacity="0.7" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── DRAIN / WASTE ───
export const DrainWasteIcon = ({ active = true, size = 40, color = '#78909C', status = 'normal' }) => {
  const pipe = shades(active, '#CFD8DC', '#78909C', '#455A64');
  const drop = shades(active, '#B3E5FC', '#4FC3F7', '#0288D1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M5 4 L5 12 C5 15.3 7.7 18 11 18 L15 18" stroke={pipe.dark} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <Circle cx="16.5" cy="18" r="2.3" fill={pipe.mid} />
      <Path d="M17 20.5 C17 20.5 15.7 22 15.7 22.9 C15.7 23.6 16.3 24.1 17 24.1" fill="none" />
      <Path d="M18.5 15 C18.5 15 20 16.6 20 17.8 C20 18.7 19.3 19.4 18.4 19.4 C17.5 19.4 16.8 18.7 16.8 17.8 C16.8 16.6 18.5 15 18.5 15Z" fill={drop.mid} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ═══════════════════════════════════════════════
// SENSORS / PARAMETERS
// (same export names & props as before — safe drop-in replacement)
// ═══════════════════════════════════════════════

// ─── TEMPERATURE ───
export const TemperatureIcon = ({ active = true, size = 40, color = '#FF5722', status = 'normal' }) => {
  const s = shades(active, '#FFCCBC', '#FF5722', '#BF360C');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="10.5" y="3" width="3" height="11" rx="1.5" fill={s.light} />
      <Circle cx="12" cy="16.5" r="3.6" fill={s.mid} />
      <Rect x="11" y="6" width="2" height="8" rx="1" fill={s.dark} />
      <Circle cx="12" cy="16.5" r="1.9" fill={s.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── HUMIDITY ───
export const HumidityIcon = ({ active = true, size = 40, color = '#2196F3', status = 'normal' }) => {
  const s = shades(active, '#BBDEFB', '#2196F3', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M12 3 C12 3 5.5 11 5.5 15.5 C5.5 19.1 8.4 22 12 22 C15.6 22 18.5 19.1 18.5 15.5 C18.5 11 12 3 12 3Z" fill={s.mid} />
      <Path d="M8.5 15.5 C8.5 17.4 10 19 12 19" stroke={s.light} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.85" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── pH ───
export const PhIcon = ({ active = true, size = 40, color = '#4CAF50', status = 'normal' }) => {
  const s = shades(active, '#C8E6C9', '#4CAF50', '#1B5E20');
  const probe = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="10.5" y="2" width="3" height="9" rx="1.3" fill={probe.dark} />
      <Path d="M8 10 C8 10 6 13.5 6 16 C6 18.2 7.8 20 10 20 C12.2 20 14 18.2 14 16 C14 13.5 12 10 12 10 Z" fill={s.mid} />
      <Path d="M9.5 16 C9.5 15 10.2 14 11 14 C11.8 14 12.5 15 12.5 16 C12.5 17 11.8 17.5 11 17.5" stroke={s.light} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── EC / TDS ───
export const EcIcon = ({ active = true, size = 40, color = '#00BCD4', status = 'normal' }) => {
  const s = shades(active, '#B2EBF2', '#00BCD4', '#00838F');
  const handle = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="10.5" y="2" width="3" height="8" rx="1.3" fill={handle.dark} />
      <Rect x="8.5" y="9" width="7" height="4" rx="1" fill={s.dark} />
      <Path d="M9 13 L15 13 L14 20 L10 20 Z" fill={s.mid} />
      <Path d="M10.5 15 L13.5 15 M10.8 17 L13.2 17" stroke={s.light} strokeWidth="1" opacity="0.8" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── CO2 ───
export const Co2Icon = ({ active = true, size = 40, color = '#9C27B0', status = 'normal' }) => {
  const s = shades(active, '#E1BEE7', '#9C27B0', '#4A148C');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M6 15 C4.3 15 3 13.7 3 12 C3 10.4 4.2 9.1 5.8 9 C6.3 6.7 8.4 5 11 5 C13.6 5 15.7 6.8 16.1 9.2 C18.3 9.4 20 11.3 20 13.5 C20 15.9 18 17.8 15.6 17.8 L7 17.8 C6 17.8 5.2 17.4 4.6 16.7" fill={s.mid} />
      <Path d="M8 12.3 L9.8 12.3 M11.5 11 L11.5 13.6 M14.2 11 L13 11 C12.4 11 12.4 13.6 13 13.6 L14.2 13.6" stroke={s.light} strokeWidth="1" fill="none" strokeLinecap="round" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── WATER LEVEL ───
export const WaterLevelIcon = ({ active = true, size = 40, color = '#2E7D32', status = 'normal' }) => {
  const glass = shades(active, '#ECEFF1', '#CFD8DC', '#90A4AE');
  const water = shades(active, '#A5D6A7', '#4CAF50', '#1B5E20');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="6" y="4" width="12" height="16" rx="1.5" fill={glass.mid} opacity="0.5" />
      <Path d="M6.5 13 C8 12.3 10 13.7 12 13 C14 12.3 16 13.7 17.5 13 L17.5 19.2 C17.5 19.6 17.1 20 16.6 20 L7.4 20 C6.9 20 6.5 19.6 6.5 19.2 Z" fill={water.mid} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── WATER FLOW ───
export const WaterFlowIcon = ({ active = true, size = 40, color = '#00695C', status = 'normal' }) => {
  const s = shades(active, '#B2DFDB', '#00695C', '#004D40');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="3" y="10" width="18" height="5" rx="2.5" fill={s.mid} />
      <Path d="M6 12.5 C7 11 8 14 9 12.5 C10 11 11 14 12 12.5 C13 11 14 14 15 12.5 C16 11 17 14 18 12.5" stroke={s.light} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <Circle cx="12" cy="19" r="2" fill={s.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── LIGHT (LUX) ───
export const LightIcon = ({ active = true, size = 40, color = '#FFC107', status = 'normal' }) => {
  const s = shades(active, '#FFECB3', '#FFC107', '#FF8F00');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Circle cx="12" cy="12" r="5.5" fill={s.mid} />
      <Circle cx="12" cy="12" r="5.5" fill={s.light} opacity="0.4" />
      <Path
        d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.5 4.5 L6.6 6.6 M17.4 17.4 L19.5 19.5 M4.5 19.5 L6.6 17.4 M17.4 6.6 L19.5 4.5"
        stroke={s.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── PRESSURE ───
export const PressureIcon = ({ active = true, size = 40, color = '#607D8B', status = 'normal' }) => {
  const s = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  const needle = shades(active, '#FFCCBC', '#FF5722', '#BF360C');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Circle cx="12" cy="13" r="8" fill={s.mid} />
      <Circle cx="12" cy="13" r="8" fill={s.light} opacity="0.35" />
      <Path d="M12 13 L15 9" stroke={needle.dark} strokeWidth="1.6" strokeLinecap="round" />
      <Circle cx="12" cy="13" r="1.5" fill={s.dark} />
      <Path d="M8 4 L16 4" stroke={s.dark} strokeWidth="1.6" strokeLinecap="round" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── SALINITY ───
export const SalinityIcon = ({ active = true, size = 40, color = '#00796B', status = 'normal' }) => {
  const s = shades(active, '#B2DFDB', '#00796B', '#004D40');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M9 3 L15 3 L14 9 L18 9 C19.1 9 20 9.9 20 11 L20 19 C20 20.1 19.1 21 18 21 L6 21 C4.9 21 4 20.1 4 19 L4 11 C4 9.9 4.9 9 6 9 L10 9 Z" fill={s.mid} />
      <Circle cx="9" cy="13" r="0.9" fill={s.light} />
      <Circle cx="13" cy="14.5" r="0.9" fill={s.light} />
      <Circle cx="10.5" cy="17" r="0.9" fill={s.light} />
      <Circle cx="15" cy="17.5" r="0.9" fill={s.light} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── ORP ───
export const ORPIcon = ({ active = true, size = 40, color = '#673AB7', status = 'normal' }) => {
  const probe = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  const s = shades(active, '#D1C4E9', '#673AB7', '#311B92');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="10.5" y="2" width="3" height="8" rx="1.3" fill={probe.dark} />
      <Path d="M8 10 C8 10 6.5 13 6.5 15.5 C6.5 18 8.5 20 11 20 C13.5 20 15.5 18 15.5 15.5 C15.5 13 14 10 14 10 Z" fill={s.mid} />
      <Path d="M9 15 C9.6 14 10.4 15.3 11 14.3 C11.6 13.3 12.4 14.6 13 13.6" stroke={s.light} strokeWidth="1" fill="none" strokeLinecap="round" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── WATER LEAK ───
export const WaterLeakIcon = ({ active = true, size = 40, color = '#F44336', status = 'normal' }) => {
  const drop = shades(active, '#B3E5FC', '#29B6F6', '#0277BD');
  const warn = shades(active, '#FFCDD2', '#F44336', '#B71C1C');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M11 3 C11 3 6 10 6 14 C6 17 8.2 19.5 11 19.5 C13.8 19.5 16 17 16 14 C16 10 11 3 11 3Z" fill={drop.mid} />
      <Path d="M17 12 L21 19 L13 19 Z" fill={warn.mid} />
      <Path d="M17 14.5 L17 16.7" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
      <Circle cx="17" cy="18" r="0.6" fill="#fff" />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── SOIL MOISTURE ───
export const SoilMoistureIcon = ({ active = true, size = 40, color = '#8D6E63', status = 'normal' }) => {
  const soil = shades(active, '#D7CCC8', '#8D6E63', '#4E342E');
  const plant = shades(active, '#A5D6A7', '#4CAF50', '#1B5E20');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M3 14 C3 12.9 3.9 12 5 12 L19 12 C20.1 12 21 12.9 21 14 L21 19 C21 20.1 20.1 21 19 21 L5 21 C3.9 21 3 20.1 3 19 Z" fill={soil.mid} />
      <Path d="M6 12 L8 15 M10 12 L11 15.5 M14 12 L13.5 15.5 M18 12 L16.5 15" stroke={soil.dark} strokeWidth="1" opacity="0.7" />
      <Path d="M12 3 L12 12" stroke={plant.dark} strokeWidth="1.6" strokeLinecap="round" />
      <Path d="M12 6 C12 6 9.5 6.2 9 8.2 C11 8.5 12 6 12 6Z" fill={plant.mid} />
      <Path d="M12 9 C12 9 14.5 9.2 15 11.2 C13 11.5 12 9 12 9Z" fill={plant.mid} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── AIR QUALITY ───
export const AirQualityIcon = ({ active = true, size = 40, color = '#795548', status = 'normal' }) => {
  const s = shades(active, '#D7CCC8', '#795548', '#3E2723');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M4 9 C4 9 5 7 7.5 7 C9.4 7 10.5 8.5 10.5 8.5" stroke={s.mid} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <Path d="M3 13 C3 13 4.5 10.5 8 10.5 C10.8 10.5 12.5 12.5 12.5 12.5" stroke={s.mid} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <Path d="M4 17 C4 17 5.5 14.5 9.5 14.5 C13 14.5 15 17 15 17" stroke={s.mid} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <Circle cx="18" cy="9" r="1.3" fill={s.dark} />
      <Circle cx="19.5" cy="17" r="1.3" fill={s.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ═══════════════════════════════════════════════
// OTHERS / STATUS
// ═══════════════════════════════════════════════

// ─── AUTO MODE ───
export const AutoModeIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const s = shades(active, '#90CAF9', '#1E88E5', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path
        d="M12 5 C15.9 5 19 8.1 19 12 M19 12 L21 10 M19 12 L17.3 10.3"
        stroke={s.mid}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M12 19 C8.1 19 5 15.9 5 12 M5 12 L3 14 M5 12 L6.7 13.7"
        stroke={s.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="12" cy="12" r="2.6" fill={s.mid} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── MANUAL MODE ───
export const ManualModeIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const s = shades(active, '#90CAF9', '#1E88E5', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path
        d="M8 12 L8 6.5 C8 5.7 8.7 5 9.5 5 C10.3 5 11 5.7 11 6.5 L11 11"
        stroke={s.mid}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M11 11 L11 5.5 C11 4.7 11.7 4 12.5 4 C13.3 4 14 4.7 14 5.5 L14 11"
        stroke={s.mid}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M14 11 L14 6.5 C14 5.7 14.7 5 15.5 5 C16.3 5 17 5.7 17 6.5 L17 13"
        stroke={s.mid}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M8 12 L6.5 10.8 C5.9 10.3 5 10.7 5 11.5 C5 11.8 5.1 12.1 5.3 12.3 L8.5 16.5 C9.3 17.6 10.6 18.3 12 18.3 L14 18.3 C16 18.3 17.5 16.7 17.5 14.7 L17.5 13"
        fill={s.dark}
      />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── SCHEDULE / TIMER ───
export const ScheduleTimerIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const s = shades(active, '#BBDEFB', '#1E88E5', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Circle cx="12" cy="13" r="8" fill={s.mid} />
      <Circle cx="12" cy="13" r="8" fill={s.light} opacity="0.35" />
      <Path d="M12 8.5 L12 13 L15 15" stroke={s.dark} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x="10" y="2" width="4" height="2" rx="1" fill={s.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── SETTINGS ───
export const SettingsIcon = ({ active = true, size = 40, color = '#607D8B', status = 'normal' }) => {
  const s = shades(active, '#CFD8DC', '#607D8B', '#37474F');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path
        d="M12 4 L12.9 6.6 L15.4 5.6 L14.8 8.2 L17.5 8.4 L15.6 10.2 L17.5 12 L14.8 12.2 L15.4 14.8 L12.9 13.8 L12 16.4 L11.1 13.8 L8.6 14.8 L9.2 12.2 L6.5 12 L8.4 10.2 L6.5 8.4 L9.2 8.2 L8.6 5.6 L11.1 6.6 Z"
        fill={s.mid}
        transform="translate(0 1.5)"
      />
      <Circle cx="12" cy="11.5" r="3" fill={s.light} />
      <Circle cx="12" cy="11.5" r="1.4" fill={s.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── ALERTS / ALARM ───
export const AlertsAlarmIcon = ({ active = true, size = 40, color = '#FFB300', status = 'normal' }) => {
  const s = shades(active, '#FFECB3', '#FFB300', '#FF6F00');
  const warn = shades(active, '#FFCDD2', '#F44336', '#B71C1C');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path
        d="M12 4 C9.5 4 7.8 6 7.8 8.5 L7.8 12.5 L6.3 15.5 C6.1 15.9 6.4 16.4 6.9 16.4 L17.1 16.4 C17.6 16.4 17.9 15.9 17.7 15.5 L16.2 12.5 L16.2 8.5 C16.2 6 14.5 4 12 4Z"
        fill={s.mid}
      />
      <Path d="M10 18 C10 19.1 10.9 20 12 20 C13.1 20 14 19.1 14 18" fill={s.dark} />
      <Circle cx="17" cy="6" r="3" fill={warn.mid} />
      <Circle cx="17" cy="6" r="1.1" fill="#fff" />
    </IconBadge>
  );
};

// ─── CONNECTIVITY ───
export const ConnectivityIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const s = shades(active, '#BBDEFB', '#1E88E5', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M4.5 10 C7 7 17 7 19.5 10" stroke={s.light} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.6" />
      <Path d="M7 13 C9 11 15 11 17 13" stroke={s.mid} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <Path d="M9.5 16 C10.8 14.8 13.2 14.8 14.5 16" stroke={s.dark} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <Circle cx="12" cy="19" r="1.6" fill={s.dark} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ─── DASHBOARD ───
export const DashboardIcon = ({ active = true, size = 40, color = '#1E88E5', status = 'normal' }) => {
  const s = shades(active, '#90CAF9', '#1E88E5', '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Rect x="4" y="4" width="7" height="7" rx="1.5" fill={s.mid} />
      <Rect x="13" y="4" width="7" height="4.5" rx="1.5" fill={s.light} />
      <Rect x="13" y="10.5" width="7" height="9.5" rx="1.5" fill={s.dark} />
      <Rect x="4" y="13" width="7" height="7" rx="1.5" fill={s.light} />
      <CornerDot active={active} status={status} />
    </IconBadge>
  );
};

// ═══════════════════════════════════════════════
// LEGACY / GENERIC (kept for backward compatibility)
// ═══════════════════════════════════════════════

// ─── VALVE (generic, direction-based) ───
export const ValveIcon = ({ active = true, direction = 'in', size = 40, color = '#00BCD4' }) => {
  const s = shades(active, '#B2EBF2', color, '#00838F');
  const isInlet = direction === 'in';
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Circle cx="12" cy="12" r="7" fill={s.mid} fillOpacity={active ? 0.3 : 1} />
      <Path
        d={isInlet ? 'M4 12 L16 12 M12 8 L16 12 L12 16' : 'M20 12 L8 12 M12 8 L8 12 L12 16'}
        stroke={active ? '#FFF' : '#9E9E9E'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <PowerBadge active={active} />
    </IconBadge>
  );
};

// ─── PUMP (generic) ───
export const PumpIcon = ({ active = true, size = 40, color = '#2196F3' }) => {
  const s = shades(active, '#90CAF9', color, '#0D47A1');
  return (
    <IconBadge size={size} active={active} tint={color}>
      <Path d="M8 8 L16 8 L16 16 L8 16 Z" fill={s.mid} fillOpacity={active ? 0.3 : 1} stroke={s.dark} strokeWidth="1.5" />
      <Path d="M7 5 L9 5 M15 5 L17 5 M7 19 L9 19 M15 19 L17 19" stroke={s.dark} strokeWidth="2" strokeLinecap="round" />
      {active && (
        <>
          <Path d="M7 4 C7 4 5 7 5 9 C5 10.1 5.9 11 7 11 C8.1 11 9 10.1 9 9 C9 7 7 4 7 4Z" fill={color} opacity="0.8" />
          <Path d="M17 4 C17 4 15 7 15 9 C15 10.1 15.9 11 17 11 C18.1 11 19 10.1 19 9 C19 7 17 4 17 4Z" fill={color} opacity="0.6" />
        </>
      )}
      <PowerBadge active={active} />
    </IconBadge>
  );
};

// ─── STATUS DOT ───
export const StatusDot = ({ active, status = 'normal', size = 10 }) => {
  const getColor = () => {
    if (!active) return '#BDBDBD';
    switch (status) {
      case 'high':
        return '#F44336';
      case 'low':
        return '#2196F3';
      case 'normal':
        return '#4CAF50';
      default:
        return '#4CAF50';
    }
  };
  const color = getColor();

  return (
    <View style={[styles.dotContainer, { width: size + 8, height: size + 8 }]}>
      {active && (
        <View
          style={[
            styles.pulseRing,
            {
              width: size + 6,
              height: size + 6,
              borderRadius: (size + 6) / 2,
              borderColor: color,
            },
          ]}
        />
      )}
      <View
        style={[
          styles.statusDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
};