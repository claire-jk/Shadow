import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps';


// 自定義機車模式地圖樣式 (簡潔深色風格)
const motoMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] }, // 隱藏興趣點
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] }
];

const CoolTurnScreen = () => {
  const [isMotoMode, setIsMotoMode] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [countdown, setCountdown] = useState(45);
  
  // 模擬熱點數據 (路面高溫路段)
  const hotSpots = [
    { id: 1, latitude: 25.0478, longitude: 121.5170, radius: 100 },
    { id: 2, latitude: 25.0495, longitude: 121.5190, radius: 150 },
  ];

  // 號誌倒數邏輯
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 90)); // 模擬循環
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* 1. 地圖層 */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={isMotoMode ? motoMapStyle : []}
        initialRegion={{
          latitude: 25.0478,
          longitude: 121.5170,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* 2. 高溫路段預警圖層 (Heatmap) */}
        {showHeatmap && hotSpots.map(spot => (
          <Circle
            key={spot.id}
            center={{ latitude: spot.latitude, longitude: spot.longitude }}
            radius={spot.radius}
            fillColor="rgba(255, 0, 0, 0.3)"
            strokeColor="rgba(255, 69, 0, 0.5)"
            strokeWidth={2}
          />
        ))}
      </MapView>

      {/* 3. 紅綠燈秒數同步浮窗 */}
      <SafeAreaView style={styles.overlayTop}>
        <View style={[styles.signalCard, { borderColor: countdown < 10 ? '#ff4757' : '#2ed573' }]}>
          <View>
            <Text style={styles.locationText}>南京西路口 (前方 150m)</Text>
            <Text style={styles.statusText}>
                {countdown > 30 ? "⚠️ 建議尋找遮蔭處" : "準備起步"}
            </Text>
          </View>
          <View style={styles.timerContainer}>
            <MaterialCommunityIcons name="traffic-light" size={24} color={countdown < 10 ? "#ff4757" : "#2ed573"} />
            <Text style={styles.timerText}>{countdown}</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* 4. 右側控制按鈕 */}
      <View style={styles.sideButtons}>
        <TouchableOpacity 
          style={[styles.iconButton, isMotoMode && styles.activeButton]} 
          onPress={() => setIsMotoMode(!isMotoMode)}
        >
          <MaterialCommunityIcons name="motorbike" size={28} color={isMotoMode ? "white" : "black"} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.iconButton, showHeatmap && styles.activeButtonHot]} 
          onPress={() => setShowHeatmap(!showHeatmap)}
        >
          <MaterialCommunityIcons name="fire" size={28} color={showHeatmap ? "white" : "black"} />
        </TouchableOpacity>
      </View>

      {/* 5. 底部動態提示語 */}
      {countdown > 30 && (
        <View style={styles.shadeAdvice}>
          <MaterialCommunityIcons name="umbrella-outline" size={20} color="white" />
          <Text style={styles.adviceText}>偵測到前方無遮蔭，建議稍後在後方騎樓旁等候</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject },
  map: { ...StyleSheet.absoluteFillObject },
  overlayTop: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
  },
  signalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 15,
    borderRadius: 15,
    borderWidth: 2,
  },
  locationText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  statusText: { color: '#aaa', fontSize: 12 },
  timerContainer: { alignItems: 'center', flexDirection: 'row' },
  timerText: { color: 'white', fontSize: 32, fontWeight: 'bold', marginLeft: 8 },
  sideButtons: {
    position: 'absolute',
    right: 20,
    top: '40%',
  },
  iconButton: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 30,
    marginBottom: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  activeButton: { backgroundColor: '#1e90ff' },
  activeButtonHot: { backgroundColor: '#ff4757' },
  shadeAdvice: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#0984e3',
    flexDirection: 'row',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  adviceText: { color: 'white', marginLeft: 10, fontSize: 14, fontWeight: '500' },
});

export default CoolTurnScreen;