import Slider from '@react-native-community/slider';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet, Text,
  TextInput,
  TouchableOpacity, View
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import SunCalc from 'suncalc';

// --- 介面定義 ---
interface Building {
  type: string;
  center: { lat: number; lon: number };
  tags: { height?: string; 'building:levels'?: string; [key: string]: any };
}

interface ParkingSpot {
  id: number;
  lat: number;
  lon: number;
  name?: string;
}

const { width, height: screenHeight } = Dimensions.get('window');
const WEATHER_API_KEY = '9e1a283f739b198eaab2f8e0943932ca';

const GreenParkEngine: React.FC = () => {
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [parkingDuration, setParkingDuration] = useState<number>(1);
  const [isShaded, setIsShaded] = useState<boolean | null>(null);
  const [ambientTemp, setAmbientTemp] = useState<number>(20);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const lastFetchedCoord = useRef({ lat: 0, lng: 0 });

  const [selectedCoord, setSelectedCoord] = useState({ lat: 25.0336, lng: 121.5648 });

  // --- 1. 氣溫抓取 ---
  const fetchWeather = async (lat: number, lon: number) => {
    try {
      const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`);
      if (!response.ok) return;
      const data = await response.json();
      if (data.main?.temp) setAmbientTemp(data.main.temp);
    } catch (error) { console.error("天氣更新失敗"); }
  };

  // --- 2. 地址搜尋 ---
  const handleSearch = async () => {
    if (!searchQuery || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`, {
        headers: { 'User-Agent': 'EcoParkEngine', 'Accept': 'application/json' }
      });
      const data = await response.json();
      if (data.length > 0) {
        const { lat, lon } = data[0];
        const newLat = parseFloat(lat);
        const newLon = parseFloat(lon);
        mapRef.current?.animateToRegion({ latitude: newLat, longitude: newLon, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 1000);
        setSelectedCoord({ lat: newLat, lng: newLon });
        fetchWeather(newLat, newLon);
        fetchData(newLat, newLon);
      } else {
        Alert.alert("找不到位置", "請輸入更具體的名稱。");
      }
    } catch (error) { Alert.alert("搜尋忙碌", "請稍候再試"); } finally { setLoading(false); }
  };

  // --- 3. 抓取建築與停車位 (含快取邏輯) ---
  const fetchData = async (lat: number, lng: number) => {
    const dist = getDistance(lat, lng, lastFetchedCoord.current.lat, lastFetchedCoord.current.lng);
    if (dist < 80 && buildings.length > 0) {
      checkShadowAtTime(buildings, new Date(), lat, lng);
      return;
    }
    setLoading(true);
    const query = `[out:json][timeout:25];(way["building"](around:250,${lat},${lng});node["amenity"="parking"](around:500,${lat},${lng});way["amenity"="parking"](around:500,${lat},${lng}););out center;`;
    
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
      if (response.status === 429) {
          Alert.alert("請求太頻繁", "請等待 10 秒後再試。");
          return;
      }
      const data = await response.json();
      const bData = data.elements.filter((el: any) => el.tags?.building);
      const pData = data.elements.filter((el: any) => el.tags?.amenity === 'parking').map((el: any) => ({
        id: el.id, lat: el.center ? el.center.lat : el.lat, lon: el.center ? el.center.lon : el.lon,
      }));
      setBuildings(bData);
      setParkingSpots(pData);
      lastFetchedCoord.current = { lat, lng };
      checkShadowAtTime(bData, new Date(), lat, lng);
    } catch (e) { console.warn("API 連線失敗"); } finally { setLoading(false); }
  };

  // --- 4. 遮蔭計算核心 ---
  const checkShadowAtTime = (bList: Building[], targetTime: Date, lat: number, lng: number) => {
    const sunPos = SunCalc.getPosition(targetTime, lat, lng);
    if (sunPos.altitude <= 0) { setIsShaded(true); return; }
    let found = false;
    bList.forEach((b: Building) => {
      const dist = getDistance(lat, lng, b.center.lat, b.center.lon);
      const h = b.tags.height ? parseFloat(b.tags.height) : (parseInt(b.tags['building:levels'] || '2') * 3);
      const shadowLen = h / Math.tan(sunPos.altitude);
      const bAzimuth = Math.atan2(b.center.lon - lng, b.center.lat - lat);
      if (dist < shadowLen && Math.abs(sunPos.azimuth - bAzimuth) < 0.6) found = true;
    });
    setIsShaded(found);
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // --- 5. 數據模型 ---
  const stats = useMemo(() => {
    const sunTemp = Math.round(ambientTemp + 15 + (parkingDuration * 4.5));
    const shadeTemp = Math.round(ambientTemp + 2 + (parkingDuration * 2.2));
    const saving = Math.max(0, (sunTemp - shadeTemp) * 0.05);
    return { sunTemp, shadeTemp, saving };
  }, [ambientTemp, parkingDuration]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* 搜尋欄 */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜尋目的地 (例如: 高雄巨蛋)..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Text style={styles.searchButtonText}>搜尋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ latitude: 25.0336, longitude: 121.5648, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
        showsUserLocation={true}
        onPress={(e) => {
          if (loading) return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setSelectedCoord({ lat: latitude, lng: longitude });
          fetchWeather(latitude, longitude);
          fetchData(latitude, longitude);
        }}
      >
        <Marker coordinate={{ latitude: selectedCoord.lat, longitude: selectedCoord.lng }}>
          <View style={styles.targetMarker}><View style={styles.targetMarkerInner} /></View>
        </Marker>

        {parkingSpots.map((spot) => (
          <Marker key={spot.id} coordinate={{ latitude: spot.lat, longitude: spot.lon }} onPress={() => {
            setSelectedCoord({ lat: spot.lat, lng: spot.lon });
            fetchWeather(spot.lat, spot.lon);
            fetchData(spot.lat, spot.lon);
          }}>
            <View style={styles.parkingBadge}>
              <Text style={styles.parkingBadgeText}>P</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* 底部數據面板 */}
      <View style={styles.panel}>
        <View style={styles.dragHandle} />
        
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>EcoPark 環境偵測</Text>
            <View style={styles.tempBadge}>
              <Text style={styles.tempBadgeText}>{ambientTemp.toFixed(1)}°C</Text>
            </View>
          </View>

          <View style={styles.mainCard}>
            <Text style={styles.cardTitle}>預計停放時間：{parkingDuration} 小時</Text>
            <Slider
              style={styles.slider}
              minimumValue={1} maximumValue={8} step={1}
              value={parkingDuration}
              onValueChange={(val) => {
                setParkingDuration(val);
                const future = new Date(new Date().getTime() + val * 3600000);
                checkShadowAtTime(buildings, future, selectedCoord.lat, selectedCoord.lng);
              }}
              minimumTrackTintColor="#4CAF50"
              thumbTintColor="#2E7D32"
            />
          </View>

          {isShaded !== null ? (
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { borderLeftColor: isShaded ? '#2196F3' : '#FF9800' }]}>
                <Text style={styles.statLabel}>車內預估</Text>
                <Text style={[styles.statValue, { color: isShaded ? '#1976D2' : '#E64A19' }]}>
                  {isShaded ? stats.shadeTemp : stats.sunTemp}°C
                </Text>
                <Text style={{fontSize: 11, color: isShaded ? '#2196F3' : '#FF9800', fontWeight:'bold'}}>
                   {isShaded ? "● 陰影覆蓋中" : "● 強烈曝曬"}
                </Text>
              </View>

              <View style={[styles.statBox, { borderLeftColor: '#4CAF50' }]}>
                <Text style={styles.statLabel}>節能回饋</Text>
                <Text style={[styles.statValue, { color: '#2E7D32' }]}>
                  {isShaded ? stats.saving.toFixed(2) : "0.00"}
                </Text>
                <Text style={styles.statSub}>Eco Point</Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              {loading ? <ActivityIndicator color="#4CAF50" /> : <Text style={styles.emptyText}>點擊地圖位置進行偵測</Text>}
            </View>
          )}
          <View style={{height: 20}} />
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  searchWrapper: { position: 'absolute', top: 50, width: '100%', paddingHorizontal: 20, zIndex: 100 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    borderRadius: 15, height: 50, elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, paddingLeft: 15
  },
  searchInput: { flex: 1, fontSize: 16, color: '#333',fontFamily:'Zen' },
  searchButton: { backgroundColor: '#2E7D32', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 8, marginRight: 5 },
  searchButtonText: { color: 'white',fontFamily:'Zen' },
  map: { width: width, height: screenHeight * 0.48 },
  targetMarker: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(46, 125, 50, 0.2)', alignItems: 'center', justifyContent: 'center' },
  targetMarkerInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2E7D32', borderWidth: 2, borderColor: 'white' },
  parkingBadge: {
    backgroundColor: '#1976D2', width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: 'white',
    alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3
  },
  parkingBadgeText: { color: 'white',fontFamily:'Zen', fontSize: 15 },
  panel: { flex: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -30, paddingHorizontal: 25, paddingVertical: 10, elevation: 20 },
  dragHandle: { width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, alignSelf: 'center', marginBottom: 15 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  headerTitle: { fontSize: 20,fontFamily:'Zen', color: '#1A1A1A' },
  tempBadge: { backgroundColor: '#F1F8E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  tempBadgeText: { color: '#2E7D32',fontFamily:'Zen', fontSize: 14 },
  mainCard: { backgroundColor: '#F8F9FA', borderRadius: 20, padding: 15, marginBottom: 15 },
  cardTitle: { fontSize: 15,fontFamily:'Zen', color: '#444', marginBottom: 5 },
  slider: { width: '100%', height: 40 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { width: '48%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, elevation: 3, borderLeftWidth: 5 },
  statLabel: { fontSize: 12, color: '#888', marginBottom: 2,fontFamily:'Zen' },
  statValue: { fontSize: 26,fontFamily:'Zen' },
  statSub: { fontSize: 11, color: '#AAA', marginTop: 5,fontFamily:'Zen' },
  emptyState: { alignItems: 'center', padding: 30 },
  emptyText: { color: '#BBB', fontSize: 14 ,fontFamily:'Zen'}
});

export default GreenParkEngine;