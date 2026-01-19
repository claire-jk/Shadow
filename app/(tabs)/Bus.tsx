import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';

import { useFonts } from 'expo-font';
import {
  ArrowRightLeft,
  Bell,
  BellRing,
  ChevronDown,
  Clock,
  Map as MapIcon,
  MapPin,
  Search,
  Thermometer,
  TreeDeciduous,
  Wind
} from 'lucide-react-native';

import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CITIES = [
  { label: '台北市', value: 'Taipei' },
  { label: '新北市', value: 'NewTaipei' },
  { label: '桃園市', value: 'Taoyuan' },
  { label: '台中市', value: 'Taichung' },
  { label: '台南市', value: 'Tainan' },
  { label: '高雄市', value: 'Kaohsiung' },
  { label: '基隆市', value: 'Keelung' },
  { label: '新竹市', value: 'Hsinchu' },
  { label: '新竹縣', value: 'HsinchuCounty' },
  { label: '苗栗縣', value: 'MiaoliCounty' },
  { label: '彰化縣', value: 'ChanghuaCounty' },
  { label: '南投縣', value: 'NantouCounty' },
  { label: '雲林縣', value: 'YunlinCounty' },
  { label: '嘉義市', value: 'Chiayi' },
  { label: '嘉義縣', value: 'ChiayiCounty' },
  { label: '屏東縣', value: 'PingtungCounty' },
  { label: '宜蘭縣', value: 'YilanCounty' },
  { label: '花蓮縣', value: 'HualienCounty' },
  { label: '台東縣', value: 'TaitungCounty' },
  { label: '澎湖縣', value: 'PenghuCounty' },
  { label: '金門縣', value: 'KinmenCounty' },
  { label: '連江縣', value: 'LienchiangCounty' },
];

interface BusStop {
  id: string;
  name: string;
  time: number | null;
  temp: number;
  shade: boolean;
  status: number;
  lat: number;
  lon: number;
}

const CONFIG = {
  TDX_CLIENT_ID: '15.29.15.29e-50c28a34-9833-4c08',
  TDX_CLIENT_SECRET: 'fcdac318-ef14-4af4-a2f3-d1b2dc0ba592',
  WEATHER_API_KEY: 'CWA-9BEFF585-4A1F-44D6-AD64-D676D2812788', 
};

export default function ShadeBusApp() {
  const [viewMode, setViewMode] = useState<'time' | 'cool'>('time');
  const [direction, setDirection] = useState<number>(0); 
  const [loading, setLoading] = useState<boolean>(false);
  const [busData, setBusData] = useState<BusStop[]>([]);
  const [searchText, setSearchText] = useState<string>('307');
  const [city, setCity] = useState(CITIES[0]);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [accessToken, setAccessToken] = useState<string>('');
  
  // 新功能狀態：追蹤展開的站點與提醒設定
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Record<string, boolean>>({});

  const [fontsLoaded] = useFonts({
    Zen: ZenKurenaido_400Regular,
    Vibes: GreatVibes_400Regular,
    Caveat: Caveat_400Regular,
  });

  const fetchToken = async (): Promise<string | null> => {
    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CONFIG.TDX_CLIENT_ID,
        client_secret: CONFIG.TDX_CLIENT_SECRET
      });
      const res = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const json = await res.json();
      return json.access_token || null;
    } catch { return null; }
  };

  const getRealWeather = async (lat: number, lon: number): Promise<number> => {
    if (!CONFIG.WEATHER_API_KEY || CONFIG.WEATHER_API_KEY.includes('YOUR_')) return 28;
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${CONFIG.WEATHER_API_KEY}`);
      const json = await res.json();
      return json?.main?.temp ? Math.round(json.main.temp) : 30;
    } catch { return 30; }
  };

  const fetchBusData = async () => {
    if (!searchText) return;
    setLoading(true);
    try {
      const token = accessToken || await fetchToken();
      if (!token) throw new Error('Auth failed');
      setAccessToken(token);

      const url = `https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/City/${city.value}/${encodeURIComponent(searchText)}?$filter=Direction eq ${direction}&$orderby=StopSequence asc&$format=JSON`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();

      if (!Array.isArray(data)) {
        setBusData([]);
        return;
      }

      const processedResults: BusStop[] = await Promise.all(
        data.map(async (item: any, idx: number) => {
          const mockLat = 25.04 + Math.random() * 0.05;
          const mockLon = 121.51 + Math.random() * 0.05;
          const tempVal = await getRealWeather(mockLat, mockLon);
          const hasShade = Math.random() > 0.4;
          return {
            id: (item.StopUID || 'stop') + (item.StopSequence || idx),
            name: item.StopName?.Zh_tw || '未知站點',
            time: item.EstimateTime !== undefined ? Math.max(0, Math.floor(item.EstimateTime / 60)) : null,
            temp: hasShade ? tempVal - 3 : tempVal,
            shade: hasShade,
            status: item.StopStatus || 0,
            lat: mockLat,
            lon: mockLon
          };
        })
      );
      setBusData(processedResults);
    } catch (err) {
      Alert.alert('搜尋失敗', '請確認路線名稱');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBusData(); }, [direction, city]);

  const toggleReminder = (id: string, name: string) => {
    const newState = !reminders[id];
    setReminders(prev => ({ ...prev, [id]: newState }));
    if (newState) {
      Alert.alert('提醒已設定', `當公車即將到達「${name}」時將會通知您。`);
    }
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedStopId(expandedStopId === id ? null : id);
  };

  if (!fontsLoaded) return <View style={styles.centered}><ActivityIndicator size="large" color="#0EA5E9" /></View>;

  const bestStop = busData.length > 0 
    ? [...busData].filter((s): s is BusStop => s.time !== null).sort((a, b) => a.temp - b.temp)[0] 
    : null;

  return (
    <SafeAreaView style={styles.mainWrapper}>
      <View style={styles.headerCard}>
        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.cityPickerBtn} onPress={() => setShowCityPicker(true)}>
            <MapPin size={16} color="#0EA5E9" />
            <Text style={styles.cityPickerText}>{city.label}</Text>
            <ChevronDown size={14} color="#64748B" />
          </TouchableOpacity>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="輸入路線，例如 307"
              placeholderTextColor="#94A3B8"
              onSubmitEditing={fetchBusData}
            />
            <TouchableOpacity onPress={fetchBusData} style={styles.searchIconBtn}>
              <Search size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity 
            style={styles.directionToggle} 
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setDirection(d => d === 0 ? 1 : 0);
            }}
          >
            <ArrowRightLeft size={16} color="#3B82F6" />
            <Text style={styles.directionText}>{direction === 0 ? '往程' : '返程'}</Text>
          </TouchableOpacity>

          <View style={styles.tabContainer}>
            <TouchableOpacity onPress={() => setViewMode('time')} style={[styles.tab, viewMode === 'time' && styles.activeTabTime]}>
              <Clock size={14} color={viewMode === 'time' ? '#fff' : '#64748B'} />
              <Text style={[styles.tabText, viewMode === 'time' && styles.activeTabText]}>時間</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('cool')} style={[styles.tab, viewMode === 'cool' && styles.activeTabCool]}>
              <Wind size={14} color={viewMode === 'cool' ? '#fff' : '#64748B'} />
              <Text style={[styles.tabText, viewMode === 'cool' && styles.activeTabText]}>避暑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={showCityPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCityPicker(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>選擇縣市</Text>
            <FlatList
              data={CITIES}
              keyExtractor={(item) => item.value}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.cityItem} onPress={() => { setCity(item); setShowCityPicker(false); }}>
                  <Text style={[styles.cityItemText, city.value === item.value && styles.activeCityText]}>{item.label}</Text>
                  {city.value === item.value && <View style={styles.activeDot} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 40 }} />
        ) : (
          <>
            {bestStop && viewMode === 'cool' && (
              <View style={styles.recommendation}>
                <View style={styles.recommendBadge}>
                  <Text style={styles.recommendBadgeText}>涼爽推薦</Text>
                </View>
                <Text style={styles.recommendInfo}>✨ {bestStop.name}：體感僅 {bestStop.temp}°C</Text>
              </View>
            )}

            {busData.length === 0 && (
              <View style={styles.emptyView}>
                <Text style={styles.emptyText}>查無路線資料</Text>
              </View>
            )}

            {busData.map((stop) => (
              <TouchableOpacity 
                key={stop.id} 
                activeOpacity={0.9} 
                onPress={() => toggleExpand(stop.id)}
                style={[styles.stopCard, expandedStopId === stop.id && styles.stopCardExpanded]}
              >
                <View style={styles.stopCardHeader}>
                  <View style={styles.stopMain}>
                    <View style={[styles.shadeIcon, { backgroundColor: stop.shade ? '#DCFCE7' : '#F1F5F9' }]}>
                      <TreeDeciduous size={18} color={stop.shade ? '#10B981' : '#CBD5E1'} />
                    </View>
                    <Text style={styles.stopNameText} numberOfLines={1}>{stop.name}</Text>
                  </View>

                  <View style={styles.stopInfo}>
                    {viewMode === 'time' ? (
                      <View style={[styles.timeBadge, stop.time === 0 && styles.timeActive]}>
                        <Text style={[styles.timeLabel, stop.time === 0 && styles.timeLabelActive]}>
                          {stop.time === null ? '未發車' : stop.time === 0 ? '進站中' : `${stop.time}分`}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.tempContainer}>
                        <Thermometer size={14} color="#F59E0B" />
                        <Text style={styles.tempValue}>{stop.temp}°C</Text>
                      </View>
                    )}
                  </View>
                </View>

                {expandedStopId === stop.id && (
                  <View style={styles.expandedContent}>
                    <View style={styles.divider} />
                    
                    {/* 地圖預覽區塊 */}
                    <View style={styles.mapPreviewContainer}>
                      <View style={styles.mapHeader}>
                        <MapIcon size={14} color="#64748B" />
                        <Text style={styles.mapHeaderText}>站點位置預覽</Text>
                      </View>
                      <Image 
                        source={{ uri: `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+ff4444(${stop.lon},${stop.lat})/${stop.lon},${stop.lat},15,0/400x200?access_token=YOUR_MAPBOX_TOKEN_OR_MOCK` }} 
                        style={styles.mapPlaceholder}
                        defaultSource={{ uri: 'https://via.placeholder.com/400x200.png?text=Loading+Map...' }}
                      />
                    </View>

                    {/* 功能按鈕區塊 */}
                    <View style={styles.actionRow}>
                      <TouchableOpacity 
                        style={[styles.actionBtn, reminders[stop.id] && styles.actionBtnActive]} 
                        onPress={() => toggleReminder(stop.id, stop.name)}
                      >
                        {reminders[stop.id] ? <BellRing size={18} color="#fff" /> : <Bell size={18} color="#0EA5E9" />}
                        <Text style={[styles.actionBtnText, reminders[stop.id] && styles.actionBtnTextActive]}>
                          {reminders[stop.id] ? '已設提醒' : '到站提醒'}
                        </Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.actionBtnSecondary}>
                        <MapPin size={18} color="#64748B" />
                        <Text style={styles.actionBtnTextSecondary}>導航至此</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: '#F1F5F9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 45,
    paddingBottom: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 5,
    zIndex: 10,
  },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  cityPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  cityPickerText: { fontSize: 14, fontFamily: 'Zen', color: '#1E293B' },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    paddingLeft: 12,
  },
  input: { flex: 1, height: 48, fontSize: 16, color: '#1E293B', fontFamily: 'Zen' },
  searchIconBtn: {
    backgroundColor: '#0EA5E9',
    width: 40,
    height: 40,
    borderRadius: 12,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  directionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  directionText: { color: '#3B82F6', fontFamily: 'Zen', fontSize: 14 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 4, borderRadius: 16 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  activeTabTime: { backgroundColor: '#3B82F6' },
  activeTabCool: { backgroundColor: '#10B981' },
  tabText: { fontSize: 13, fontFamily: 'Zen', color: '#64748B' },
  activeTabText: { color: '#fff' },
  scrollContainer: { padding: 20, paddingBottom: 40 },
  recommendation: {
    backgroundColor: '#0EA5E9',
    padding: 16,
    borderRadius: 20,
    marginBottom: 20,
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  recommendBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 4 },
  recommendBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Zen' },
  recommendInfo: { color: '#fff', fontSize: 16, fontFamily: 'Zen' },
  stopCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 2,
    overflow: 'hidden',
  },
  stopCardExpanded: {
    borderColor: '#0EA5E9',
    borderWidth: 1,
  },
  stopCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  stopMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  shadeIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stopNameText: { fontSize: 16, fontFamily: 'Zen', color: '#334155', flexShrink: 1 },
  stopInfo: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  timeBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  timeActive: { backgroundColor: '#FEE2E2' },
  timeLabel: { fontSize: 14, fontFamily: 'Zen', color: '#64748B' },
  timeLabelActive: { color: '#EF4444' },
  tempContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tempValue: { fontSize: 18, fontFamily: 'Zen', color: '#1E293B' },
  
  // 擴展內容樣式
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 16,
  },
  mapPreviewContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
  },
  mapHeaderText: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: 'Zen',
  },
  mapPlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#E2E8F0',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  actionBtnActive: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0EA5E9',
  },
  actionBtnText: {
    color: '#0EA5E9',
    fontFamily: 'Zen',
    fontSize: 14,
  },
  actionBtnTextActive: {
    color: '#fff',
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnTextSecondary: {
    color: '#64748B',
    fontFamily: 'Zen',
    fontSize: 14,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, height: '80%' },
  modalHandle: { width: 40, height: 5, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 20, fontFamily: 'Zen', marginBottom: 20, color: '#1E293B', textAlign: 'center' },
  cityItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  cityItemText: { fontSize: 16, color: '#64748B', fontFamily: 'Zen' },
  activeCityText: { color: '#0EA5E9', fontWeight: 'bold' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0EA5E9' },
  emptyView: { marginTop: 60, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 16, fontFamily: 'Zen' },
});