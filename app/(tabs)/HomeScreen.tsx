import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// --- 設定區 ---
const CWA_API_KEY = 'CWA-9BEFF585-4A1F-44D6-AD64-D676D2812788'; // 您的 API Key

// --- 子組件：詳細資訊列 ---
const DetailItem = ({ icon, label, value, suffix, valueColor = '#000' }: any) => (
  <View style={styles.detailRow}>
    <View style={styles.row}>
      {icon} 
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
    <View style={styles.row}>
      <Text style={[styles.detailValue, { color: valueColor }]}>{value}</Text>
      {suffix && <Text style={styles.detailSuffix}>{suffix}</Text>}
    </View>
  </View>
);

export default function HomeScreen() {
  // 狀態管理
  const [loading, setLoading] = useState(false);
  const [locationName, setLocationName] = useState('定位中...');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [alertTemp, setAlertTemp] = useState(35);
  
  const [weatherData, setWeatherData] = useState({
    temp: '--',
    apparentTemp: 0, // 數值型態方便比對
    humidity: '--',
    windSpeed: '--',
    uv: '--',
    time: '--'
  });

  // 1. 核心邏輯：獲取定位與氣象數據
  const fetchWeather = async () => {
    setLoading(true);
    try {
      // A. 定位
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('請開啟定位權限');

      let location = await Location.getCurrentPositionAsync({});
      let reverse = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (!reverse.length) throw new Error('無法識別當前位置');

      const addr = reverse[0];
      setLocationName(`${addr.district || ''}${addr.street || ''}${addr.name || ''}`);

      // B. 縣市名稱修正（氣象署標準化）
      const taiwanCities = [
        '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
        '基隆市', '新竹縣', '新竹市', '苗栗縣', '彰化縣', '南投縣',
        '雲林縣', '嘉義縣', '嘉義市', '屏東縣', '宜蘭縣', '花蓮縣',
        '臺東縣', '澎湖縣', '金門縣', '連江縣'
      ];
      let rawString = [addr.city, addr.subregion, addr.region].join(',');
      let cityQuery = taiwanCities.find(c => rawString.includes(c) || rawString.includes(c.replace('臺', '台'))) || '臺北市';

      // C. 同時請求 預報(F-C0032) 與 即時觀測(O-A0003)
      const forecastUrl = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${CWA_API_KEY}&locationName=${encodeURIComponent(cityQuery)}`;
      const obsUrl = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=${CWA_API_KEY}&locationName=${encodeURIComponent(cityQuery)}`;

      const [fRes, oRes] = await Promise.all([fetch(forecastUrl), fetch(obsUrl)]);
      const fJson = await fRes.json();
      const oJson = await oRes.json();

      const forecast = fJson.records?.location?.[0]?.weatherElement;
      const obs = oJson.records?.Station?.[0]?.WeatherElement;

      if (forecast) {
        // 解析基本數據
        const minT = parseInt(forecast.find((e: any) => e.elementName === 'MinT')?.time[0].parameter.parameterName || '25');
        const maxT = parseInt(forecast.find((e: any) => e.elementName === 'MaxT')?.time[0].parameter.parameterName || '35');
        const currentT = Math.round((minT + maxT) / 2);
        
        const humid = obs?.RelativeHumidity ?? 75;
        const wind = obs?.WindSpeed ?? 2;

        // 計算體感溫度公式 (Steadman's Apparent Temperature)
        const apparentT = Math.round(currentT + (humid - 50) * 0.12 - (wind * 0.4));

        setWeatherData({
          temp: currentT.toString(),
          apparentTemp: apparentT,
          humidity: humid.toString(),
          windSpeed: (wind * 3.6).toFixed(1),
          uv: obs?.UVIndex || '5',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        // 如果體感溫度超過警報設定，主動提醒
        if (apparentT >= alertTemp) {
          Alert.alert("🔥 高溫警報", `當前體感溫度已達 ${apparentT}°C，請注意防暑避難！`);
        }
      }
    } catch (e: any) {
      Alert.alert('更新失敗', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWeather(); }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={{ paddingBottom: 60 }}>
        <Text style={styles.headerTitle}>微型氣候避難</Text>
        <Text style={styles.subHeader}>即時監測，安心出行</Text>

        {/* 1. 定位區塊 */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <Ionicons name="location-sharp" size={20} color="#3B82F6" />
              <Text style={styles.locationText}>{locationName}</Text>
            </View>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchWeather} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#3B82F6" /> : <Ionicons name="refresh" size={16} color="#333" />}
              {!loading && <Text style={styles.refreshText}>重新整理</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.updateTime}>最後更新：{weatherData.time}</Text>
        </View>

        {/* 2. 溫度數據區塊 */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <MaterialCommunityIcons name="thermometer" size={24} color="#EF4444" />
              <Text style={styles.label}>體感溫度</Text>
            </View>
            {weatherData.apparentTemp >= 38 && (
              <View style={styles.dangerBadge}>
                <Text style={styles.dangerBadgeText}>極度危險</Text>
              </View>
            )}
          </View>

          <View style={styles.tempMainRow}>
            <Text style={styles.bigTemp}>{weatherData.apparentTemp}<Text style={styles.degreeUnit}>°C</Text></Text>
            <TouchableOpacity style={styles.expandRow} onPress={() => setIsExpanded(!isExpanded)}>
              <Text style={styles.expandText}>詳細分析</Text>
              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#3B82F6" />
            </TouchableOpacity>
          </View>
          <Text style={styles.actualTemp}>實際溫度 {weatherData.temp}°C</Text>

          {isExpanded && (
            <View style={styles.detailsList}>
              <View style={styles.separator} />
              <DetailItem icon={<Ionicons name="water" size={20} color="#3B82F6" />} label="濕度" value={`${weatherData.humidity}%`} />
              <DetailItem icon={<Feather name="wind" size={20} color="#10B981" />} label="風速" value={`${weatherData.windSpeed} km/h`} />
              <DetailItem 
                icon={<Feather name="sun" size={20} color="#F59E0B" />} 
                label="紫外線指數" value={weatherData.uv} 
                valueColor={parseInt(weatherData.uv) >= 8 ? "#EF4444" : "#000"}
                suffix={parseInt(weatherData.uv) >= 8 ? "(極高)" : ""} 
              />
            </View>
          )}
        </View>

        {/* 3. 警報設定區塊 */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <Ionicons name="notifications" size={20} color="#EF4444" />
              <Text style={styles.label}>熱風險警報設定</Text>
            </View>
            <TouchableOpacity 
              style={isSettingOpen ? styles.completeBtn : styles.settingBtn} 
              onPress={() => setIsSettingOpen(!isSettingOpen)}
            >
              <Text style={isSettingOpen ? styles.completeBtnText : styles.settingBtnText}>{isSettingOpen ? '完成' : '設定'}</Text>
            </TouchableOpacity>
          </View>

          {isSettingOpen && (
            <View style={styles.settingBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.settingPrompt}>體感溫度達到</Text>
                <Text style={styles.alertValue}>{alertTemp}°C</Text>
              </View>
              <Slider
                style={{ width: '100%', height: 40, marginTop: 10 }}
                minimumValue={25} maximumValue={45} step={1}
                value={alertTemp} onValueChange={setAlertTemp}
                minimumTrackTintColor="#1E293B" maximumTrackTintColor="#E2E8F0" thumbTintColor="#1E293B"
              />
              <View style={styles.rowBetween}><Text style={styles.rangeText}>25°C</Text><Text style={styles.rangeText}>45°C</Text></View>
              <View style={styles.notificationNote}>
                <Text style={styles.noteText}>當體感溫度達到 <Text style={{fontWeight: '700'}}>{alertTemp}°C</Text> 時，將發送「預防熱傷害」通知</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 20, paddingTop: 60 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#0F172A' },
  subHeader: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 16, elevation: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locationText: { fontSize: 18, fontWeight: '600', marginLeft: 8, maxWidth: '60%' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', padding: 8, borderRadius: 12 },
  refreshText: { fontSize: 13, marginLeft: 4, fontWeight: '500' },
  updateTime: { fontSize: 12, color: '#94A3B8', marginTop: 10 },
  label: { fontSize: 16, color: '#475569', marginLeft: 8 },
  dangerBadge: { backgroundColor: '#A855F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  dangerBadgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  tempMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 15 },
  bigTemp: { fontSize: 60, fontWeight: '700', color: '#1E293B' },
  degreeUnit: { fontSize: 24, fontWeight: '400' },
  expandRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10 },
  expandText: { color: '#3B82F6', fontSize: 15, marginRight: 4 },
  actualTemp: { color: '#64748B', fontSize: 15, marginTop: 4 },
  detailsList: { marginTop: 15 },
  separator: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 15 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  detailLabel: { fontSize: 16, color: '#64748B', marginLeft: 12 },
  detailValue: { fontSize: 18, fontWeight: '600' },
  detailSuffix: { fontSize: 14, color: '#64748B', marginLeft: 4 },
  settingBtn: { backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  settingBtnText: { color: '#333', fontWeight: '600' },
  completeBtn: { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  completeBtnText: { color: 'white', fontWeight: '600' },
  settingBox: { marginTop: 20 },
  settingPrompt: { fontSize: 17, color: '#475569' },
  alertValue: { fontSize: 32, fontWeight: 'bold', color: '#EF4444' },
  rangeText: { fontSize: 12, color: '#94A3B8' },
  notificationNote: { backgroundColor: '#FFFBEB', padding: 15, borderRadius: 15, marginTop: 20, borderWidth: 1, borderColor: '#FEF3C7' },
  noteText: { color: '#92400E', fontSize: 14, lineHeight: 20 }
});