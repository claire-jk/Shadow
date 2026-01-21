import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps';

const TDX_CONFIG = {
  clientId: '15.29.15.29e-50c28a34-9833-4c08', 
  clientSecret: 'fcdac318-ef14-4af4-a2f3-d1b2dc0ba592', 
};

// 增加行政區關鍵字，防止定位名稱不精準
const CITY_MAP: Record<string, string> = {
  '高雄': 'Kaohsiung', '左營': 'Kaohsiung', '苓雅': 'Kaohsiung', '三民': 'Kaohsiung', '新興': 'Kaohsiung', '鳳山': 'Kaohsiung',
  '臺北': 'Taipei', '台北': 'Taipei', '信義': 'Taipei', '中正': 'Taipei',
  '新北': 'NewTaipei', '板橋': 'NewTaipei',
  '桃園': 'Taoyuan', '中壢': 'Taoyuan',
  '臺中': 'Taichung', '台中': 'Taichung', '西屯': 'Taichung',
  '臺南': 'Tainan', '台南': 'Tainan', '安平': 'Tainan',
  '屏東': 'PingtungCounty'
};

const MOTO_MAP_STYLE = [
  { "elementType": "geometry", "stylers": [{ "color": "#1c1c1e" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#3a3a3c" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0a192f" }] }
];

const CoolTurnScreen: React.FC = () => {
  const [userLocation, setUserLocation] = useState<any>(null);
  const [currentCity, setCurrentCity] = useState<string>("定位中...");
  const [locationName, setLocationName] = useState("正在搜尋號誌...");
  const [countdown, setCountdown] = useState(0);
  const [signalStatus, setSignalStatus] = useState<'GREEN' | 'RED' | 'YELLOW'>('RED');
  const [loading, setLoading] = useState(false);
  const [showHeatMap, setShowHeatMap] = useState(false);
  
  const accessTokenRef = useRef<string | null>(null);
  const currentSignalRef = useRef<any>(null);

  const requestLocation = async () => {
    setLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("需要權限", "請開啟定位權限以使用機車模式");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation(loc.coords);
      await fetchData(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      console.error("定位失敗", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (lat: number, lon: number) => {
    setLoading(true);
    try {
      // A. Token 檢查
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

      // B. 強化版縣市辨識邏輯
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      let cityCode = ""; // 預設空字串

      if (geo.length > 0) {
        const addressString = `${geo[0].region}${geo[0].city}${geo[0].district}${geo[0].name}`;
        console.log("偵測到完整地址:", addressString);

        // 掃描關鍵字
        for (const key in CITY_MAP) {
          if (addressString.includes(key)) {
            cityCode = CITY_MAP[key];
            break;
          }
        }
      }

      // 如果辨識完全失敗，至少保證不閃退
      if (!cityCode) cityCode = "Taipei";
      setCurrentCity(cityCode);

      // C. 抓取 TDX 號誌
      const range = 0.008; 
      const filter = `abs(Position/PositionLat - ${lat}) le ${range} and abs(Position/PositionLon - ${lon}) le ${range}`;
      const url = `https://tdx.transportdata.tw/api/basic/v2/Road/TrafficSignal/Plan/City/${cityCode}?$filter=${encodeURIComponent(filter)}&$top=1&$format=JSON`;
      
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessTokenRef.current}` } });
      const data = await res.json();

      if (data && data.length > 0) {
        currentSignalRef.current = data[0];
        setLocationName(`路口 ID: ${data[0].SignalID}`);
      } else {
        setLocationName(`${cityCode} 區域無資料`);
        currentSignalRef.current = null;
        setCountdown(0);
      }
    } catch (e) {
      console.log("資料更新失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    requestLocation();
  }, []);

  const calculateLight = useCallback(() => {
    if (!currentSignalRef.current || !currentSignalRef.current.Plans) return;
    const { CycleTime, Offset, Plans } = currentSignalRef.current;
    const now = new Date();
    const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    let posInCycle = (secondsSinceMidnight - (Offset || 0)) % CycleTime;
    if (posInCycle < 0) posInCycle += CycleTime;

    const steps = Plans[0].SignalSteps;
    let elapsed = 0;
    for (const step of steps) {
      elapsed += step.Duration;
      if (posInCycle < elapsed) {
        setSignalStatus(step.HumanDisplay === 1 ? 'GREEN' : (step.HumanDisplay === 3 ? 'YELLOW' : 'RED'));
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
        onPress={(e) => fetchData(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
        region={userLocation ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
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
              <Text style={styles.cityLabel}>定位縣市: {currentCity}</Text>
              {loading && <ActivityIndicator size="small" color="#fff" style={{marginLeft: 10}} />}
            </View>
            <Text style={styles.title}>{locationName}</Text>
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
  timer: { fontSize: 42, fontWeight: '900' },
  unitText: { color: 'white', fontSize: 12 },
  buttonGroup: { position: 'absolute', bottom: 40, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { backgroundColor: '#3a3a3c', flexDirection: 'row', padding: 12, borderRadius: 30, width: '48%', justifyContent: 'center', alignItems: 'center' },
  btnText: { color: 'white', marginLeft: 8, fontWeight: 'bold' }
});

export default CoolTurnScreen;