import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');
const CWA_API_KEY = 'CWA-9BEFF585-4A1F-44D6-AD64-D676D2812788';

// --- 美化版：詳細資訊卡片 ---
const StatCard = ({ icon, label, value, unit, color }: any) => (
  <View style={styles.statCard}>
    <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
      {icon}
    </View>
    <Text style={styles.statLabel}>{label}</Text>
    <View style={styles.row}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  </View>
);

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [locationName, setLocationName] = useState('定位中...');
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [alertTemp, setAlertTemp] = useState(35);
  
  const [weatherData, setWeatherData] = useState({
    temp: '--',
    apparentTemp: 0,
    humidity: '--',
    windSpeed: '--',
    uv: '--',
    time: '--'
  });

const fetchWeather = async () => {
    setLoading(true);
    try {
      // 1. 檢查並請求定位
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('權限不足', '請至設定開啟定位權限以獲取當地氣象');
        setLoading(false);
        return;
      }

      // 2. 獲取座標與地址
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      let reverse = await Location.reverseGeocodeAsync(location.coords);
      
      if (!reverse || reverse.length === 0) throw new Error('無法辨識地址');
      const addr = reverse[0];
      setLocationName(`${addr.city || ''} ${addr.district || ''}`);

      // 3. 縣市名稱「嚴格正規化」
      const taiwanCities = [
        '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
        '基隆市', '新竹縣', '新竹市', '苗栗縣', '彰化縣', '南投縣',
        '雲林縣', '嘉義縣', '嘉義市', '屏東縣', '宜蘭縣', '花蓮縣',
        '臺東縣', '澎湖縣', '金門縣', '連江縣'
      ];

      // 將地址資訊合併後，尋找匹配的縣市名
      let fullAddrString = [addr.region, addr.city, addr.subregion].join('');
      // 統一轉為繁體「臺」來比對
      let normalizedAddr = fullAddrString.replace(/台/g, '臺');
      let cityQuery = taiwanCities.find(c => normalizedAddr.includes(c)) || '臺北市';

      // 4. API 請求
      const obsUrl = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${CWA_API_KEY}&LocationName=${encodeURIComponent(cityQuery)}`;
      
      const response = await fetch(obsUrl);
      const oJson = await response.json();

      if (!oJson.success) {
        throw new Error(oJson.result?.message || 'API 密鑰無效或請求失敗');
      }

      const station = oJson.records?.Station?.[0];
      if (!station) throw new Error(`找不到 ${cityQuery} 的觀測站數據`);

// 5. 解析數據 (萬用解析法：兼容陣列與物件結構)
      const getVal = (name: string) => {
        const elements = station.WeatherElement;
        
        // 情況 A: 如果 WeatherElement 是陣列 (標準格式)
        if (Array.isArray(elements)) {
          const found = elements.find((e: any) => e.ElementName === name);
          return found ? parseFloat(found.ElementValue) : null;
        } 
        
        // 情況 B: 如果 WeatherElement 是物件 (部分自動站格式)
        if (elements && typeof elements === 'object') {
          return elements[name] ? parseFloat(elements[name]) : null;
        }

        return null;
      };

      // 取得數值，並給予保險用的預設值
      const currentT = getVal('AirTemperature') ?? 25;
      const humid = getVal('RelativeHumidity') ?? 70;
      const wind = getVal('WindSpeed') ?? 2;
      const uv = getVal('UVIndex') ?? 0;

      // 6. 計算體感並更新
      const apparentT = Math.round(currentT + (humid - 50) * 0.12 - (wind * 0.4));

      setWeatherData({
        temp: currentT.toFixed(1),
        apparentTemp: apparentT,
        humidity: humid.toString(),
        windSpeed: (wind * 3.6).toFixed(1),
        uv: uv.toString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      if (apparentT >= alertTemp) {
        Alert.alert("🔥 高溫警報", `當前體感溫度已達 ${apparentT}°C！`);
      }
    } catch (e: any) {
      console.error("DEBUG - Weather Error:", e); // 這行會在你的開發終端印出真正的錯誤
      Alert.alert('更新失敗', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWeather(); }, []);

  // 根據溫度決定主色調
  const getTempColor = () => {
    if (weatherData.apparentTemp >= 38) return '#EF4444'; // 極熱
    if (weatherData.apparentTemp >= 32) return '#F59E0B'; // 悶熱
    return '#3B82F6'; // 舒適
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.mainWrapper}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>微型氣候避難</Text>
            <View style={styles.row}>
              <Ionicons name="location-sharp" size={14} color="#64748B" />
              <Text style={styles.locationSub}>{locationName}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={fetchWeather} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#3B82F6" /> : <Feather name="refresh-cw" size={20} color="#1E293B" />}
          </TouchableOpacity>
        </View>

        {/* 溫度大卡片 */}
        <View style={[styles.heroCard, { shadowColor: getTempColor() }]}>
          <Text style={styles.heroLabel}>當前體感溫度</Text>
          <View style={styles.tempRow}>
            <Text style={[styles.heroTemp, { color: getTempColor() }]}>{weatherData.apparentTemp}</Text>
            <Text style={styles.heroUnit}>°C</Text>
          </View>
          <View style={styles.actualTempBadge}>
            <Text style={styles.actualTempText}>實際測得 {weatherData.temp}°C</Text>
          </View>
          <Text style={styles.updateText}>最後同步：{weatherData.time}</Text>
        </View>

        {/* 詳細指標 */}
        <View style={styles.statsGrid}>
          <StatCard icon={<Ionicons name="water" size={20} color="#3B82F6" />} label="濕度" value={weatherData.humidity} unit="%" color="#3B82F6" />
          <StatCard icon={<Feather name="wind" size={20} color="#10B981" />} label="風速" value={weatherData.windSpeed} unit="km/h" color="#10B981" />
          <StatCard icon={<Feather name="sun" size={20} color="#F59E0B" />} label="紫外" value={weatherData.uv} unit="UVI" color="#F59E0B" />
        </View>

        {/* 警報設定 */}
        <View style={styles.settingCard}>
          <TouchableOpacity style={styles.rowBetween} onPress={() => setIsSettingOpen(!isSettingOpen)}>
            <View style={styles.row}>
              <MaterialCommunityIcons name="bell-ring-outline" size={22} color="#EF4444" />
              <Text style={styles.settingTitle}>高溫預警設定</Text>
            </View>
            <Ionicons name={isSettingOpen ? "chevron-up" : "chevron-down"} size={20} color="#94A3B8" />
          </TouchableOpacity>
          
          {isSettingOpen && (
            <View style={styles.settingContent}>
              <View style={styles.rowBetween}>
                <Text style={styles.settingHint}>體感達到此溫度時提醒</Text>
                <Text style={styles.alertValue}>{alertTemp}°C</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={25} maximumValue={45} step={1}
                value={alertTemp} onValueChange={setAlertTemp}
                minimumTrackTintColor="#1E293B" thumbTintColor="#1E293B"
              />
              <Text style={styles.noteText}>設定後，若體感溫度超過臨界值，App 將彈出警告提醒您尋找陰涼處。</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  mainWrapper: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  headerTitle: { fontSize: 24, fontFamily:'Zen', color: '#0F172A', letterSpacing: -0.5 },
  locationSub: { fontSize: 13, color: '#64748B', marginLeft: 4 , fontFamily:'Zen'},
  iconBtn: { padding: 10, backgroundColor: '#FFF', borderRadius: 14, elevation: 2, shadowOpacity: 0.1 },
  
  heroCard: { 
    backgroundColor: '#FFF', borderRadius: 32, padding: 30, alignItems: 'center',
    elevation: 20, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20,
    marginBottom: 24
  },
  heroLabel: { fontSize: 15, color: '#94A3B8', fontFamily:'Zen', marginBottom: 8 },
  tempRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroTemp: { fontSize: 90, fontFamily:'Zen', lineHeight: 90, letterSpacing: -2 },
  heroUnit: { fontSize: 28, fontFamily:'Zen', marginTop: 14, color: '#1E293B' },
  actualTempBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
  actualTempText: { fontSize: 14, color: '#475569', fontFamily:'Zen' },
  updateText: { fontSize: 12, color: '#CBD5E1', marginTop: 20, fontFamily:'Zen' },

  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  statCard: { 
    backgroundColor: '#FFF', width: (width - 48 - 24) / 3, borderRadius: 24, padding: 16, 
    alignItems: 'center', elevation: 2, shadowOpacity: 0.05 
  },
  iconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 , fontFamily:'Zen'},
  statValue: { fontSize: 18, fontFamily:'Zen', color: '#1E293B' },
  statUnit: { fontSize: 10, color: '#94A3B8', marginLeft: 2, alignSelf: 'flex-end', marginBottom: 3 , fontFamily:'Zen'},

  settingCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, elevation: 2, shadowOpacity: 0.05 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingTitle: { fontSize: 16, fontFamily:'Zen', color: '#1E293B', marginLeft: 10 },
  settingContent: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  settingHint: { fontSize: 14, color: '#64748B', fontFamily:'Zen' },
  alertValue: { fontSize: 24, fontFamily:'Zen', color: '#EF4444' },
  slider: { width: '100%', height: 40, marginVertical: 10 },
  noteText: { fontSize: 12, color: '#94A3B8', lineHeight: 18, marginTop: 10, fontFamily:'Zen' }
});