import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps';

// --- TDX API 配置 ---
const TDX_CONFIG = {
  clientId: '15.29.15.29e-50c28a34-9833-4c08', 
  clientSecret: 'fcdac318-ef14-4af4-a2f3-d1b2dc0ba592', 
};

// --- 行政區與縣市對照表 ---
const CITY_MAP: Record<string, string> = {
  '高雄': 'Kaohsiung', 'Kaohsiung': 'Kaohsiung', '鼓山': 'Kaohsiung', '左營': 'Kaohsiung', 
  '楠梓': 'Kaohsiung', '苓雅': 'Kaohsiung', '三民': 'Kaohsiung', '新興': 'Kaohsiung', 
  '前鎮': 'Kaohsiung', '臺北': 'Taipei', '台北': 'Taipei', '新北': 'NewTaipei', 
  '桃園': 'Taoyuan', '臺中': 'Taichung', '台中': 'Taichung', '臺南': 'Tainan', 
  '台南': 'Tainan', '屏東': 'PingtungCounty'
};

// --- 機車模式地圖樣式 ---
const MOTO_MAP_STYLE = [
  { "elementType": "geometry", "stylers": [{ "color": "#1c1c1e" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#3a3a3c" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0a192f" }] }
];

const CoolTurnScreen: React.FC = () => {
  const [userLocation, setUserLocation] = useState<any>(null);
  const [currentCity, setCurrentCity] = useState<string>("定位中...");
  const [locationName, setLocationName] = useState("正在搜尋最近號誌...");
  const [countdown, setCountdown] = useState(0);
  const [signalStatus, setSignalStatus] = useState<'GREEN' | 'RED' | 'YELLOW'>('RED');
  const [loading, setLoading] = useState(false);
  const [showHeatMap, setShowHeatMap] = useState(false);
  
  const accessTokenRef = useRef<string | null>(null);
  const currentSignalRef = useRef<any>(null);

  // --- 1. 取得號誌資料 ---
  const fetchData = async (lat: number, lon: number) => {
    setLoading(true);
    try {
      if (!accessTokenRef.current) {
        const params = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: TDX_CONFIG.clientId,
          client_secret: TDX_CONFIG.clientSecret,
        });
        const res = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        const auth = await res.json();
        accessTokenRef.current = auth.access_token;
      }

      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      let cityCode = "Taipei"; 
      if (geo.length > 0) {
        const addr = `${geo[0].region}${geo[0].city}${geo[0].district}${geo[0].name}`;
        for (const key in CITY_MAP) {
          if (addr.includes(key)) {
            cityCode = CITY_MAP[key];
            break;
          }
        }
      }
      setCurrentCity(cityCode);

      // 搜尋半徑擴大
      const range = 0.005; 
      const filter = `abs(Position/PositionLat - ${lat}) le ${range} and abs(Position/PositionLon - ${lon}) le ${range}`;
      const url = `https://tdx.transportdata.tw/api/basic/v2/Road/TrafficSignal/Plan/City/${cityCode}?$filter=${encodeURIComponent(filter)}&$top=1&$format=JSON`;
      
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessTokenRef.current}` } });
      const data = await res.json();

      if (data && data.length > 0) {
        currentSignalRef.current = data[0];
        setLocationName(`路口號誌: ${data[0].SignalID}`);
        // 強制先計算一次
        setTimeout(() => calculateLight(), 100);
      } else {
        setLocationName(`附近 500m 內無號誌`);
        currentSignalRef.current = null;
        setCountdown(0);
      }
    } catch (e) {
      console.warn("更新失敗", e);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. 初始化定位 ---
  const requestLocation = async () => {
    setLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("權限不足", "請開啟定位");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation(loc.coords);
      await fetchData(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { requestLocation(); }, []);

  // --- 3. 號誌推算核心 ---
  const calculateLight = useCallback(() => {
    if (!currentSignalRef.current || !currentSignalRef.current.Plans) return;
    
    const plan = currentSignalRef.current.Plans[0];
    const { CycleTime, Offset } = currentSignalRef.current;
    
    const now = new Date();
    // 考慮台灣時區與 TDX 基準時間
    const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    let posInCycle = (secondsSinceMidnight - (Offset || 0)) % CycleTime;
    if (posInCycle < 0) posInCycle += CycleTime;

    let elapsed = 0;
    const steps = plan.SignalSteps;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      elapsed += step.Duration;
      if (posInCycle < elapsed) {
        // 修正：部分地區 1 是綠燈，有些 0 是紅燈，這裡強化判定
        let status: 'GREEN' | 'RED' | 'YELLOW' = 'RED';
        if (step.HumanDisplay === 1) status = 'GREEN';
        else if (step.HumanDisplay === 3) status = 'YELLOW';
        else status = 'RED';

        setSignalStatus(status);
        setCountdown(Math.ceil(elapsed - posInCycle));
        break;
      }
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(calculateLight, 1000);
    return () => clearInterval(timer);
  }, [calculateLight]);

  const themeColor = signalStatus === 'GREEN' ? '#2ed573' : (signalStatus === 'YELLOW' ? '#ffa502' : '#ff4757');

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        customMapStyle={MOTO_MAP_STYLE}
        showsUserLocation
        onPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setUserLocation({ latitude, longitude });
          fetchData(latitude, longitude);
        }}
        region={userLocation ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        } : undefined}
      >
        {showHeatMap && userLocation && (
          <Circle center={userLocation} radius={200} fillColor="rgba(255, 69, 0, 0.4)" strokeWidth={0} />
        )}
      </MapView>
      
      <SafeAreaView style={styles.overlay}>
        <View style={[styles.card, { borderLeftColor: themeColor }]}>
          <View style={{ flex: 1 }}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={styles.cityLabel}>📍 {currentCity}</Text>
              {loading && <ActivityIndicator size="small" color={themeColor} style={{marginLeft: 8}} />}
            </View>
            <Text style={styles.title} numberOfLines={1}>{locationName}</Text>
          </View>
          <View style={styles.timerContainer}>
            <Text style={[styles.timer, { color: themeColor }]}>{countdown}</Text>
            <Text style={styles.unitText}>秒</Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.buttonGroup}>
        <TouchableOpacity 
          style={[styles.actionBtn, showHeatMap && {backgroundColor: '#ff4757'}]} 
          onPress={() => setShowHeatMap(!showHeatMap)}
        >
          <MaterialCommunityIcons name="fire" size={26} color="white" />
          <Text style={styles.btnText}>高溫預警</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={requestLocation}>
          <MaterialCommunityIcons name="target" size={26} color="white" />
          <Text style={styles.btnText}>重新定位</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 50, left: 15, right: 15 },
  card: { backgroundColor: 'rgba(28, 28, 30, 0.95)', flexDirection: 'row', padding: 18, borderRadius: 20, borderLeftWidth: 10, alignItems: 'center' },
  cityLabel: { color: '#8e8e93', fontSize: 11, fontWeight: 'bold' },
  title: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  timerContainer: { alignItems: 'center', minWidth: 60 },
  timer: { fontSize: 42, fontWeight: '900', lineHeight: 45 },
  unitText: { color: 'white', fontSize: 12 },
  buttonGroup: { position: 'absolute', bottom: 40, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { backgroundColor: '#3a3a3c', flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, width: '48%', justifyContent: 'center', alignItems: 'center' },
  btnText: { color: 'white', marginLeft: 8, fontWeight: 'bold' }
});

export default CoolTurnScreen;