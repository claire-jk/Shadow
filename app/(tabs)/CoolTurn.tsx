import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';

// --- 配置區 ---
const TDX_CONFIG = {
  clientId: '15.29.15.29e-50c28a34-9833-4c08', 
  clientSecret: 'fcdac318-ef14-4af4-a2f3-d1b2dc0ba592', 
};

interface Building {
  id: string;
  height: number;
  nodes: { latitude: number; longitude: number }[];
}

const MOTO_MAP_STYLE = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }
];

const CoolTurnScreen: React.FC = () => {
  const [isMotoMode, setIsMotoMode] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showShadows, setShowShadows] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [locationName, setLocationName] = useState("定位中...");
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);

  // 使用 useRef 管理計時器，避免 TypeScript 類型報錯與閉包問題
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- 1. 取得 GPS 定位 ---
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('權限不足', '請開啟定位權限以計算最近路口');
        return;
      }
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (loc) => setUserLocation(loc.coords)
      );
    })();
  }, []);

  // --- 2. 從 OSM 獲取真實建築數據 ---
  const fetchOSMBuildings = useCallback(async (lat: number, lon: number) => {
    const range = 0.002;
    const query = `
      [out:json];
      way["building"](${lat - range},${lon - range},${lat + range},${lon + range});
      out body;
      >;
      out skel qt;
    `;
    try {
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const nodes: any = {};
      data.elements.filter((e: any) => e.type === 'node').forEach((n: any) => {
        nodes[n.id] = { latitude: n.lat, longitude: n.lon };
      });

      const buildingList: Building[] = data.elements
        .filter((e: any) => e.type === 'way' && e.tags)
        .map((b: any) => ({
          id: b.id.toString(),
          height: parseInt(b.tags.height || b.tags['building:levels'] * 3 || '15'),
          nodes: b.nodes.map((nodeId: number) => nodes[nodeId]).filter(Boolean),
        }));
      setBuildings(buildingList);
    } catch (e) {
      console.error("OSM 數據抓取失敗");
    }
  }, []);

  useEffect(() => {
    if (userLocation) {
      fetchOSMBuildings(userLocation.latitude, userLocation.longitude);
    }
  }, [userLocation, fetchOSMBuildings]);

  // --- 3. 太陽陰影演算法 ---
  const dynamicShadows = useMemo(() => {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const azimuthRad = ((hour - 6) * 15 * Math.PI) / 180;
    const altitudeRad = ((90 - Math.abs(hour - 12) * 10) * Math.PI) / 180;

    return buildings.map(b => {
      const shadowLength = (b.height / Math.tan(altitudeRad || 0.1)) * 0.000009;
      const offsetLat = -Math.cos(azimuthRad) * shadowLength;
      const offsetLng = -Math.sin(azimuthRad) * shadowLength;

      const shadowCoords = b.nodes.map(n => ({
        latitude: n.latitude + offsetLat,
        longitude: n.longitude + offsetLng,
      }));

      return { id: `sh-${b.id}`, coordinates: [...b.nodes, ...shadowCoords.reverse()] };
    });
  }, [buildings]);

  // --- 4. TDX 號誌串接 ---
  const updateTrafficLight = useCallback(async (token: string, lat: number, lon: number) => {
    try {
      const filter = `(abs(Position/PositionLat - ${lat}) le 0.002) and (abs(Position/PositionLon - ${lon}) le 0.002)`;
      const url = `https://tdx.transportdata.tw/api/basic/v2/Traffic/Signal/Live/City/Taipei?$filter=${encodeURIComponent(filter)}&$top=1&$format=JSON`;
      
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      
      if (data && data.length > 0) {
        setCountdown(data[0].Signals[0].RemainingTime || 0);
        setLocationName(data[0].IntersectionName || "偵測到路口");
      }
    } catch (e) {
      console.warn("TDX 號誌更新失敗");
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const response = await fetch('https://tdx.transportdata.tw/auth/realms/TDX/protocol/openid-connect/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=client_credentials&client_id=${TDX_CONFIG.clientId}&client_secret=${TDX_CONFIG.clientSecret}`,
        });
        const auth = await response.json();
        
        if (auth.access_token && userLocation) {
          updateTrafficLight(auth.access_token, userLocation.latitude, userLocation.longitude);
          
          // 清除舊計時器
          if (syncTimerRef.current) clearInterval(syncTimerRef.current);
          
          // 設定新計時器
          syncTimerRef.current = setInterval(() => {
            updateTrafficLight(auth.access_token, userLocation.latitude, userLocation.longitude);
          }, 5000);
        }
      } catch (err) {
        console.error("Auth Failed");
      }
    };

    init();
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [userLocation, updateTrafficLight]);

  // 本地平滑倒數
  useEffect(() => {
    const t = setInterval(() => setCountdown(p => (p > 0 ? p - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={isMotoMode ? MOTO_MAP_STYLE : []}
        showsUserLocation={true}
        region={userLocation ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        } : undefined}
      >
        {showShadows && dynamicShadows.map(sh => (
          <Polygon key={sh.id} coordinates={sh.coordinates} fillColor="rgba(0, 40, 0, 0.35)" strokeWidth={0} />
        ))}
        {showHeatmap && userLocation && (
          <Circle center={userLocation} radius={100} fillColor="rgba(255, 0, 0, 0.2)" strokeColor="#ff4757" />
        )}
      </MapView>

      <SafeAreaView style={styles.overlayTop}>
        <View style={[styles.signalCard, { borderLeftColor: countdown < 10 ? '#ff4757' : '#2ed573' }]}>
          <View style={styles.flexShrink}>
            <Text style={styles.locationTitle}>{locationName}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: countdown > 20 ? '#ffa502' : '#2f3542' }]}>
                <Text style={styles.badgeText}>{countdown > 20 ? "建議躲避陰影" : "準備起步"}</Text>
              </View>
              <Text style={styles.distanceText}>GPS 已定位</Text>
            </View>
          </View>
          <View style={styles.timerBox}>
            <Text style={[styles.timerText, { color: countdown < 10 ? '#ff4757' : '#2ed573' }]}>{countdown}</Text>
            <Text style={styles.unitText}>秒</Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.sideButtons}>
        <TouchableOpacity style={[styles.iconButton, isMotoMode && styles.activeMoto]} onPress={() => setIsMotoMode(!isMotoMode)}>
          <MaterialCommunityIcons name="motorbike" size={26} color={isMotoMode ? "white" : "#57606f"} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, showShadows && styles.activeShadow]} onPress={() => setShowShadows(!showShadows)}>
          <MaterialCommunityIcons name="umbrella" size={26} color={showShadows ? "white" : "#57606f"} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, showHeatmap && styles.activeHeat]} onPress={() => setShowHeatmap(!showHeatmap)}>
          <MaterialCommunityIcons name="fire" size={26} color={showHeatmap ? "white" : "#57606f"} />
        </TouchableOpacity>
      </View>

      {countdown > 25 && (
        <View style={styles.adviceBanner}>
          <MaterialCommunityIcons name="shield-sun" size={24} color="#fbc531" />
          <Text style={styles.adviceText}>紅燈尚久，建議於後方建築陰影區停等避暑。</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject },
  map: { ...StyleSheet.absoluteFillObject },
  overlayTop: { position: 'absolute', top: 50, left: 15, right: 15 },
  signalCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(25, 25, 25, 0.95)',
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 10,
  },
  flexShrink: { flex: 1 },
  locationTitle: { color: 'white', fontSize: 16, fontWeight: '900', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: 8 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  distanceText: { color: '#ced6e0', fontSize: 12 },
  timerBox: { alignItems: 'flex-end', minWidth: 60 },
  timerText: { fontSize: 38, fontWeight: '900', lineHeight: 42 },
  unitText: { color: 'white', fontSize: 12, textAlign: 'right', marginTop: -5 },
  sideButtons: { position: 'absolute', right: 15, bottom: '25%' },
  iconButton: {
    backgroundColor: 'white',
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeMoto: { backgroundColor: '#1e90ff' },
  activeShadow: { backgroundColor: '#2ed573' },
  activeHeat: { backgroundColor: '#ff4757' },
  adviceBanner: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#2f3542',
    flexDirection: 'row',
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fbc531',
  },
  adviceText: { color: 'white', marginLeft: 12, fontSize: 14, flex: 1, lineHeight: 20 },
});

export default CoolTurnScreen;