import { Bell, Bus, Camera, Navigation, TreeDeciduous, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const ShadeBusApp = () => {
  const [isCoolMode, setIsCoolMode] = useState(true);
  const [remindSet, setRemindSet] = useState(false);

  // 模擬公車站點數據
  const busStops = [
    { id: '1', name: '大安森林公園', time: 3, shade: 0.9, temp: 28, crowd: '低', suggest: false },
    { id: '2', name: '信義建國路口', time: 7, shade: 0.2, temp: 36, crowd: '高', suggest: true },
    { id: '3', name: '捷運大安站', time: 12, shade: 0.6, temp: 31, crowd: '中', suggest: false },
  ];

  // 處理預約提醒邏輯 [🕒 預約涼爽提醒]
  const handleReminder = () => {
    setRemindSet(!remindSet);
    if (!remindSet) {
      Alert.alert("預約成功", "當公車剩 3 站時，系統將提醒您從室內出發。");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 頂部控制欄 [🚌 公車動態切換] */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>綠蔭巴士站</Text>
          <Text style={styles.subtitle}>285 路線 - 往榮總</Text>
        </View>
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>{isCoolMode ? '清涼度視角' : '動態視角'}</Text>
          <Switch 
            value={isCoolMode} 
            onValueChange={setIsCoolMode}
            trackColor={{ false: "#767577", true: "#4ADE80" }}
          />
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* 建議站點跳轉 [🔄 建議站點跳轉] */}
        {isCoolMode && (
          <TouchableOpacity style={styles.suggestionBox}>
            <Navigation color="#166534" size={20} />
            <Text style={styles.suggestionText}>
              檢測到「下一站」有大片建築遮蔭，體感降 5°C，建議前往。
            </Text>
          </TouchableOpacity>
        )}

        {/* 站點列表 */}
        {busStops.map((stop) => (
          <View key={stop.id} style={styles.stopCard}>
            <View style={styles.stopInfo}>
              <View style={[styles.iconCircle, { backgroundColor: isCoolMode ? '#DCFCE7' : '#DBEAFE' }]}>
                {isCoolMode ? (
                  <TreeDeciduous color={stop.shade > 0.5 ? "#16A34A" : "#CA8A04"} size={24} />
                ) : (
                  <Bus color="#2563EB" size={24} />
                )}
              </View>
              <View style={styles.nameContainer}>
                <Text style={styles.stopName}>{stop.name}</Text>
                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <Users size={12} color="#666" />
                    <Text style={styles.tagText}>人流: {stop.crowd}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.dataContainer}>
              {isCoolMode ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.tempText, { color: stop.temp > 33 ? '#EA580C' : '#16A34A' }]}>
                    {stop.temp}°C
                  </Text>
                  <Text style={styles.subText}>體感溫度</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.timeText}>{stop.time} min</Text>
                  <Text style={styles.subText}>預計抵達</Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 底部操作欄 [📸 現場影像回報] */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.reportButton} onPress={() => Alert.alert("開啟相機", "請拍攝站點遮蔭狀況")}>
          <Camera color="#4B5563" size={24} />
          <Text style={styles.buttonText}>回報遮蔭</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.remindButton, remindSet && styles.remindButtonActive]} 
          onPress={handleReminder}
        >
          <Bell color="white" size={24} />
          <Text style={styles.remindButtonText}>{remindSet ? '已設提醒' : '預約涼爽'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB'
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280' },
  toggleContainer: { alignItems: 'center' },
  toggleLabel: { fontSize: 10, color: '#6B7280', marginBottom: 4 },
  
  suggestionBox: {
    flexDirection: 'row', backgroundColor: '#DCFCE7', margin: 15, padding: 15,
    borderRadius: 12, alignItems: 'center', gap: 10
  },
  suggestionText: { color: '#166534', fontSize: 13, flex: 1, fontWeight: '500' },

  content: { flex: 1 },
  stopCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F3F4F6'
  },
  stopInfo: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  nameContainer: { 
    flex: 1, 
    justifyContent: 'center' 
  },
  stopName: { fontSize: 17, fontWeight: '600', color: '#1F2937' },
  
  tagRow: { flexDirection: 'row', marginTop: 4 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 },
  tagText: { fontSize: 11, color: '#6B7280' },

  dataContainer: { minWidth: 80 },
  tempText: { fontSize: 20, fontWeight: 'bold' },
  timeText: { fontSize: 20, fontWeight: 'bold', color: '#2563EB' },
  subText: { fontSize: 11, color: '#9CA3AF' },

  footer: { 
    flexDirection: 'row', padding: 20, gap: 15, backgroundColor: 'white',
    borderTopWidth: 1, borderTopColor: '#E5E7EB' 
  },
  reportButton: { 
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F3F4F6', height: 55, borderRadius: 16, gap: 8
  },
  remindButton: { 
    flex: 1.5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#3B82F6', height: 55, borderRadius: 16, gap: 8
  },
  remindButtonActive: { backgroundColor: '#10B981' },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#4B5563' },
  remindButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
});

export default ShadeBusApp;