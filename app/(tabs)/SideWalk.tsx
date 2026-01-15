import Slider from '@react-native-community/slider';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Keyboard,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import MapView, { Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import SunCalc from 'suncalc';

const DEFAULT_LAT = 25.0339;
const DEFAULT_LNG = 121.5645;

type ShadowState = {
  coords: { latitude: number; longitude: number }[];
  sunAltitude: string;
};

export default function CoolingCorridorApp() {
  const [startPoint, setStartPoint] = useState('');
  const [destination, setDestination] = useState('');
  const [routeMode, setRouteMode] = useState<'fast' | 'cool' | 'shaded'>('cool');
  const [shadowTime, setShadowTime] = useState(0);

  const [currentShadow, setCurrentShadow] = useState<ShadowState>({
    coords: [],
    sunAltitude: '0.0',
  });

  const updateShadows = useCallback((offsetMinutes = 0) => {
    try {
      const now = new Date();
      const futureTime = new Date(
        now.getTime() + (Number(offsetMinutes) || 0) * 60000
      );

      const sunPos = SunCalc.getPosition(
        futureTime,
        DEFAULT_LAT,
        DEFAULT_LNG
      );

      const altitude = sunPos.altitude;
      const azimuth = sunPos.azimuth;

      let shadowPath: { latitude: number; longitude: number }[] = [];

      if (altitude > 0) {
        const safeTan = Math.max(0.1, Math.tan(altitude));
        const shadowFactor = Math.min(0.002, 0.0005 / safeTan);

        // 陰影方向 = 太陽方向反向
        const bearing = azimuth + Math.PI;

        const dx = shadowFactor * Math.sin(bearing);
        const dy = shadowFactor * Math.cos(bearing);

        shadowPath = [
          { latitude: DEFAULT_LAT + 0.0005, longitude: DEFAULT_LNG + 0.0005 },
          {
            latitude: DEFAULT_LAT + 0.0005 + dy,
            longitude: DEFAULT_LNG + 0.0005 + dx,
          },
          {
            latitude: DEFAULT_LAT + 0.0007 + dy,
            longitude: DEFAULT_LNG + 0.0003 + dx,
          },
          { latitude: DEFAULT_LAT + 0.0007, longitude: DEFAULT_LNG + 0.0003 },
        ];
      }

      setCurrentShadow({
        coords: shadowPath,
        sunAltitude: (altitude * (180 / Math.PI)).toFixed(1),
      });
    } catch (error) {
      console.warn('Shadow calculation error:', error);
    }
  }, []);

  useEffect(() => {
    updateShadows(shadowTime);
  }, [shadowTime, updateShadows]);

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <View style={styles.container}>
        {/* 搜尋欄 */}
        <View style={styles.searchContainer}>
          <View style={styles.inputWrapper}>
            <Text style={styles.icon}>⚪</Text>
            <TextInput
              style={styles.input}
              placeholder="輸入出發地..."
              value={startPoint}
              onChangeText={setStartPoint}
            />
          </View>
          <View style={[styles.inputWrapper, { borderBottomWidth: 0 }]}>
            <Text style={[styles.icon, { color: '#E74C3C' }]}>📍</Text>
            <TextInput
              style={styles.input}
              placeholder="輸入目的地..."
              value={destination}
              onChangeText={setDestination}
            />
          </View>
        </View>

        {/* 地圖 */}
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: DEFAULT_LAT,
            longitude: DEFAULT_LNG,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          {currentShadow.coords.length >= 4 && (
            <Polygon
              coordinates={currentShadow.coords}
              fillColor="rgba(0,0,0,0.35)"
              strokeColor="rgba(0,0,0,0.1)"
            />
          )}

          <Polyline
            coordinates={[
              { latitude: 25.033, longitude: 121.565 },
              { latitude: 25.035, longitude: 121.568 },
            ]}
            strokeColor={routeMode === 'cool' ? '#2ECC71' : '#4A90E2'}
            strokeWidth={6}
          />
        </MapView>

        {/* 資訊窗 */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ☀️ 太陽仰角: {currentShadow.sunAltitude}°
          </Text>
          <Text style={styles.infoText}>🌡️ 路面體感: 38°C</Text>
        </View>

        {/* 底部控制 */}
        <View style={styles.bottomSheet}>
          <View style={styles.tabBar}>
            {(['fast', 'cool', 'shaded'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => setRouteMode(mode)}
                style={[
                  styles.tabItem,
                  routeMode === mode && styles.activeTab,
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    routeMode === mode && styles.activeLabel,
                  ]}
                >
                  {mode === 'fast'
                    ? '⚡ 最快'
                    : mode === 'cool'
                    ? '🌿 綠蔭'
                    : '☂️ 騎樓'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.timelineSection}>
            <View style={styles.timelineHeader}>
              <Text style={styles.timelineTitle}>🕒 未來陰影預測</Text>
              <Text style={styles.timelineValue}>+{shadowTime} min</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={120}
              step={15}
              value={shadowTime}
              onValueChange={(v) => setShadowTime(v)}
              minimumTrackTintColor="#2ECC71"
              maximumTrackTintColor="#ECF0F1"
              thumbTintColor="#2ECC71"
            />
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  searchContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    paddingHorizontal: 15,
    elevation: 10,
    zIndex: 100,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    height: 45,
  },
  icon: { width: 20, textAlign: 'center' },
  input: { flex: 1 },
  infoBox: {
    position: 'absolute',
    top: 170,
    left: 20,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
  },
  infoText: { fontSize: 12 },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: 20,
    backgroundColor: 'white',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
  tabBar: { flexDirection: 'row', marginBottom: 20 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { backgroundColor: '#2ECC71', borderRadius: 10 },
  tabLabel: { fontWeight: 'bold' },
  activeLabel: { color: 'white' },
  timelineSection: {},
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineTitle: { fontWeight: 'bold' },
  timelineValue: { color: '#2ECC71' },
});
