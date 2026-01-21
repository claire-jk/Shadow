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

// --- 類型定義 ---
interface Building {
  id: string;
  height: number;
  nodes: { latitude: number; longitude: number }[];
}

interface SignalStep {
  Step: number;
  HumanDisplay: number; // 1:綠, 2:紅, 3:黃
  Duration: number;
}

const MOTO_MAP_STYLE = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }
];

const CoolTurnScreen: React.FC = () => {
  // UI 狀態
  const [isMotoMode, setIsMotoMode] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showShadows, setShowShadows] = useState(true);
  
  // 號誌狀態
  const [countdown, setCountdown] = useState(0);
  const [signalStatus, setSignalStatus] = useState<'GREEN' | 'RED' | 'YELLOW'>('RED');
  const [locationName, setLocationName] = useState("尋找最近路口...");
  
  // 定位與數據
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const currentSignalRef = useRef<any>(null);
  const accessTokenRef = useRef<string | null>(null);

  // --- 1. 定位與權限 ---
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('權限不足', '請開啟定位權限以計算遮蔭區');
        return;
      }
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 30 },
        (loc) => setUserLocation(loc.coords)
      );
    })();
  }, []);

  // --- 2. OSM 建築數據抓取 ---
  const fetchOSMBuildings = useCallback(async (lat: number, lon: number) => {
    const range = 0.003; // 抓取範圍
    const query = `[out:json][timeout:25];way["building"](${lat - range},${lon - range},${lat + range},${lon + range});out body;>;out skel qt;`;
    
    try {
      const response = await fetch(`https://overpass-api.de/api/interpreter`, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`
      });
      const data = await response.json();
      const nodes: any = {};
      data.elements.filter((e: any) => e.type === 'node').forEach((n: any) => {
        nodes[n.id] = { latitude: n.lat, longitude: n.lon };
      });

      const buildingList: Building[] = data.elements
        .filter((e: any) => e.type === 'way' && e.tags)
        .map((b: any) => ({
          id: b.id.toString(),
          height: parseInt(b.tags.height || (b.tags['building:levels'] * 3) || '15'),
          nodes: b.nodes.map((nodeId: number) => nodes[nodeId]).filter(Boolean),
        }));
      setBuildings(buildingList);
    } catch (e) {
      console.error("OSM 抓取失敗:", e);
    }
  }, []);

  // --- 3. TDX 認證與號誌抓取 ---
  const fetchTrafficSignal = useCallback(async (lat: number, lon: number) => {
    if (!accessTokenRef.current) return;
    try {
      // 搜尋 200 公尺內的一個路口
      const filter = `abs(Position/PositionLat - ${lat}) le 0.002 and abs(Position/PositionLon - ${lon}) le 0.002`;
      const url = `https://tdx.transportdata.tw/api/basic/v2/Road/TrafficSignal/Plan/City/Taipei?$filter=${encodeURIComponent(filter)}&$top=1&$format=JSON`;
      
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessTokenRef.current}` } });
      const data = await res.json();

      if (data && data.length > 0) {
        currentSignalRef.current = data[0];
        setLocationName(data[0].SignalID + " 路口");
      }
    } catch (e) {
      console.warn("TDX 號誌解析失敗");
    }
  }, []);

  useEffect(() => {
    const initTDX = async () => {
      try {
        const params = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: TDX_CONFIG.clientId,
          client_secret: TDX_CONFIG.clientSecret,
        });

        const authRes = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        const auth = await authRes.json();
        if (auth.access_token) {
          accessTokenRef.current = auth.access_token;
          if (userLocation) {
            fetchTrafficSignal(userLocation.latitude, userLocation.longitude);
            fetchOSMBuildings(userLocation.latitude, userLocation.longitude);
          }
        }
      } catch (err) {
        console.error("TDX Auth 失敗", err);
      }
    };
    initTDX();
  }, [userLocation, fetchTrafficSignal, fetchOSMBuildings]);

  // --- 4. 核心推算邏輯 (方案 A) ---
  const calculateLight = useCallback(() => {
    if (!currentSignalRef.current) return;

    const { CycleTime, Offset, Plans } = currentSignalRef.current;
    const now = new Date();
    // 取得自 00:00:00 以來的秒數
    const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    // 算出週期中的相對位置
    let posInCycle = (secondsSinceMidnight - (Offset || 0)) % CycleTime;
    if (posInCycle < 0) posInCycle += CycleTime;

    // 匹配目前秒數落在哪個燈號
    const steps: SignalStep[] = Plans[0].SignalSteps;
    let elapsed = 0;
    const colorMap: Record<number, 'GREEN' | 'RED' | 'YELLOW'> = { 1: 'GREEN', 2: 'RED', 3: 'YELLOW' };

    for (const step of steps) {
      elapsed += step.Duration;
      if (posInCycle < elapsed) {
        setSignalStatus(colorMap[step.HumanDisplay] || 'RED');
        setCountdown(Math.ceil(elapsed - posInCycle));
        break;
      }
    }
  }, []);

  // 每一秒更新一次推算
  useEffect(() => {
    const timer = setInterval(calculateLight, 1000);
    return () => clearInterval(timer);
  }, [calculateLight]);

  // --- 5. 太陽陰影演算法 ---
  const dynamicShadows = useMemo(() => {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    // 簡單模擬：早上 6 點東方，18 點西方
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

  const themeColor = signalStatus === 'GREEN' ? '#2ed573' : (signalStatus === 'YELLOW' ? '#ffa502' : '#ff4757');

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
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        } : undefined}
      >
        {showShadows && dynamicShadows.map(sh => (
          <Polygon key={sh.id} coordinates={sh.coordinates} fillColor="rgba(0, 0, 0, 0.45)" strokeWidth={0} />
        ))}
        {showHeatmap && userLocation && (
          <Circle center={userLocation} radius={100} fillColor="rgba(255, 63, 52, 0.2)" strokeColor="#ff3f34" />
        )}
      </MapView>

      <SafeAreaView style={styles.overlayTop}>
        <View style={[styles.signalCard, { borderLeftColor: themeColor }]}>
          <View style={styles.flexShrink}>
            <Text style={styles.locationTitle}>{locationName}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: signalStatus === 'RED' && countdown > 15 ? '#ffa502' : '#2f3542' }]}>
                <Text style={styles.badgeText}>
                  {signalStatus === 'RED' ? (countdown > 15 ? "建議避暑" : "準備起步") : "號誌綠燈"}
                </Text>
              </View>
              <Text style={styles.statusText}>{signalStatus === 'RED' ? '紅燈停等' : '通行中'}</Text>
            </View>
          </View>
          <View style={styles.timerBox}>
            <Text style={[styles.timerText, { color: themeColor }]}>{countdown}</Text>
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

      {signalStatus === 'RED' && countdown > 20 && (
        <View style={styles.adviceBanner}>
          <MaterialCommunityIcons name="shield-sun" size={24} color="#fbc531" />
          <Text style={styles.adviceText}>偵測到長紅燈，建議退至後方建築陰影區以躲避曝曬。</Text>
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
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    padding: 16,
    borderRadius: 20,
    borderLeftWidth: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 12,
  },
  flexShrink: { flex: 1 },
  locationTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginRight: 8 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: '900' },
  statusText: { color: '#a4b0be', fontSize: 13 },
  timerBox: { alignItems: 'center', width: 70 },
  timerText: { fontSize: 42, fontWeight: '900', lineHeight: 46 },
  unitText: { color: 'white', fontSize: 12, marginTop: -5 },
  sideButtons: { position: 'absolute', right: 15, top: '35%' },
  iconButton: {
    backgroundColor: 'white',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  activeMoto: { backgroundColor: '#1e90ff' },
  activeShadow: { backgroundColor: '#2ed573' },
  activeHeat: { backgroundColor: '#ff4757' },
  adviceBanner: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#1c1c1e',
    flexDirection: 'row',
    padding: 20,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fbc531',
    elevation: 8,
  },
  adviceText: { color: 'white', marginLeft: 15, fontSize: 15, flex: 1, lineHeight: 22, fontWeight: '500' },
});

export default CoolTurnScreen;