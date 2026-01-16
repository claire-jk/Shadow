import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, Modal, StyleSheet, Text, TextInput,
  TouchableOpacity, TouchableWithoutFeedback, View
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import SunCalc from 'suncalc';

// API Key (OpenRouteService)
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImZhNjJiMDJhOTQ1NTQ3M2Q4NDRiYmMzMjVkM2UxMGVmIiwiaCI6Im11cm11cjY0In0=';

// 模擬補水站資料
const REST_STOPS = [
  { id: '1', title: '百貨避暑點', type: 'mall', latitude: 25.0339, longitude: 121.5645 },
  { id: '2', title: '公用飲水機', type: 'water', latitude: 25.0380, longitude: 121.5680 },
];

// --- AR 實景組件 ---
function ARModeView({ visible, onClose, rotation }: any) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <Modal visible={visible}>
        <View style={styles.centered}>
          <Text style={{ marginBottom: 20 }}>需要相機權限才能開啟 AR</Text>
          <TouchableOpacity style={styles.goButton} onPress={requestPermission}><Text style={styles.goText}>授權權限</Text></TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 20 }} onPress={onClose}><Text>關閉</Text></TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={{ flex: 1 }}>
        <CameraView style={{ flex: 1 }} facing="back">
          <View style={styles.arOverlay}>
            <Text style={styles.arTitle}>👓 AR 實景涼爽預測</Text>
            
            {/* 根據陀螺儀移動的虛擬標籤 */}
            <View style={[styles.heatPoint, { 
              top: 300 + rotation.beta * 150, 
              left: 100 + rotation.gamma * 150 
            }]}>
              <View style={styles.coolBadge}><Text style={{color: 'white'}}>🌿 預測陰影區</Text></View>
              <View style={styles.hotBadge}><Text style={{color: 'white'}}>🔥 地表高溫 38°C</Text></View>
            </View>

            <View style={styles.directionGuide}>
              <Text style={styles.guideText}>前方 50m 轉向騎樓</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>離開 AR</Text>
          </TouchableOpacity>
        </CameraView>
      </View>
    </Modal>
  );
}

// --- 主程式 ---
export default function CoolingCorridorApp() {
  const mapRef = useRef<MapView>(null);
  const [startPoint, setStartPoint] = useState<any>(null);
  const [destination, setDestination] = useState<any>(null);
  const [startText, setStartText] = useState('');
  const [destText, setDestText] = useState('');
  const [routeCoords, setRouteCoords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routePreference, setRoutePreference] = useState<'fast' | 'cool' | 'shaded'>('cool');
  const [timeOffset, setTimeOffset] = useState(0);
  const [shadows, setShadows] = useState<any[]>([]);
  const [isARVisible, setIsARVisible] = useState(false);
  const [rotation, setRotation] = useState({ alpha: 0, beta: 0, gamma: 0 });

  useEffect(() => {
    autoLocate();
    // 監聽陀螺儀供 AR 使用
    DeviceMotion.setUpdateInterval(100);
    const sub = DeviceMotion.addListener((data) => {
      setRotation(data.rotation);
    });
    return () => sub.remove();
  }, []);

  const autoLocate = async () => {
    setIsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setStartPoint(coord);
      setStartText('我的目前位置');
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    } catch (e) {
      Alert.alert('錯誤', '無法獲取位置');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateShadows = useCallback((offset: number) => {
    if (!startPoint) return;
    const date = new Date();
    date.setMinutes(date.getMinutes() + offset);
    const sunPos = SunCalc.getPosition(date, startPoint.latitude, startPoint.longitude);
    const altitude = sunPos.altitude;
    const azimuth = sunPos.azimuth;

    if (altitude > 0) {
      const shadowLength = 0.0006 / Math.tan(altitude); 
      const dx = shadowLength * Math.sin(azimuth + Math.PI);
      const dy = shadowLength * Math.cos(azimuth + Math.PI);
      const bLat = startPoint.latitude + 0.0005;
      const bLng = startPoint.longitude + 0.0005;
      setShadows([
        { latitude: bLat, longitude: bLng },
        { latitude: bLat + dy, longitude: bLng + dx },
        { latitude: bLat + dy + 0.0002, longitude: bLng + dx + 0.0002 },
        { latitude: bLat + 0.0002, longitude: bLng + 0.0002 },
      ]);
    } else { setShadows([]); }
  }, [startPoint]);

  useEffect(() => { calculateShadows(timeOffset); }, [timeOffset, calculateShadows]);

  const handlePlanRoute = async () => {
    if (!startText || !destText) return;
    setIsLoading(true);
    try {
      let finalStart = startPoint;
      if (startText !== '我的目前位置') {
        const startGeo = await Location.geocodeAsync(startText);
        if (startGeo.length > 0) finalStart = { latitude: startGeo[0].latitude, longitude: startGeo[0].longitude };
      }
      const destGeo = await Location.geocodeAsync(destText);
      const finalDest = { latitude: destGeo[0].latitude, longitude: destGeo[0].longitude };
      setDestination(finalDest);

      const url = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${finalStart.longitude},${finalStart.latitude}&end=${finalDest.longitude},${finalDest.latitude}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.features) {
        const points = json.features[0].geometry.coordinates.map((p: any) => ({ latitude: p[1], longitude: p[0] }));
        setRouteCoords(points);
        mapRef.current?.fitToCoordinates(points, { edgePadding: { top: 150, bottom: 450, left: 80, right: 80 } });
      }
    } catch (e) {
      Alert.alert("錯誤", "路徑規劃失敗");
    } finally {
      setIsLoading(false);
      Keyboard.dismiss();
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <View style={styles.searchContainer}>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} placeholder="起點地址" value={startText} onChangeText={setStartText} />
            <TouchableOpacity onPress={autoLocate} style={styles.locateBtn}><Text>📍</Text></TouchableOpacity>
          </View>
          <View style={[styles.inputRow, { marginTop: 10 }]}>
            <TextInput style={styles.input} placeholder="目的地" value={destText} onChangeText={setDestText} onSubmitEditing={handlePlanRoute} />
            <TouchableOpacity onPress={() => setIsARVisible(true)} style={styles.arButton}><Text style={styles.arText}>👓 AR</Text></TouchableOpacity>
            <TouchableOpacity onPress={handlePlanRoute} style={styles.goButton}>
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.goText}>GO</Text>}
            </TouchableOpacity>
          </View>
          <View style={styles.preferenceRow}>
            {(['fast', 'cool', 'shaded'] as const).map((pref) => (
              <TouchableOpacity key={pref} onPress={() => setRoutePreference(pref)} style={[styles.prefBtn, routePreference === pref && styles.prefBtnActive]}>
                <Text style={[styles.prefBtnText, routePreference === pref && styles.prefBtnTextActive]}>
                  {pref === 'fast' ? '⚡最快' : pref === 'cool' ? '🌿涼爽' : '☂️遮蔽'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <MapView ref={mapRef} style={styles.map} provider={PROVIDER_GOOGLE} showsUserLocation={true}>
          {startPoint && <Marker coordinate={startPoint} title="起點" pinColor="blue" />}
          {destination && <Marker coordinate={destination} title="終點" />}
          {REST_STOPS.map(stop => (
            <Marker key={stop.id} coordinate={stop} title={stop.title}>
              <View style={styles.restMarker}><Text>{stop.type === 'water' ? '💧' : '🏬'}</Text></View>
            </Marker>
          ))}
          {shadows.length > 0 && <Polygon coordinates={shadows} fillColor="rgba(0,0,0,0.3)" strokeWidth={0} />}
          {routeCoords.length > 0 && <Polyline coordinates={routeCoords} strokeWidth={6} strokeColor={routePreference === 'cool' ? '#2ECC71' : routePreference === 'shaded' ? '#F1C40F' : '#3498DB'} />}
        </MapView>

        <ARModeView visible={isARVisible} onClose={() => setIsARVisible(false)} rotation={rotation} />

        <View style={styles.bottomPanel}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderTitle}>🕒 陰影偏移預測 (小時後)</Text>
            <Text style={styles.sliderTime}>+{timeOffset} 分鐘</Text>
          </View>
          <Slider style={{width: '100%', height: 40}} minimumValue={0} maximumValue={60} step={15} value={timeOffset} onValueChange={setTimeOffset} minimumTrackTintColor="#2ECC71" thumbTintColor="#2ECC71" />
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: { position: 'absolute', top: 50, left: 20, right: 20, backgroundColor: 'white', borderRadius: 20, padding: 15, zIndex: 100, elevation: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, height: 45, backgroundColor: '#F5F5F5', borderRadius: 10, paddingHorizontal: 15 },
  locateBtn: { padding: 10 },
  arButton: { backgroundColor: '#34495E', padding: 10, borderRadius: 10, marginLeft: 10 },
  arText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  goButton: { backgroundColor: '#2ECC71', padding: 12, borderRadius: 10, marginLeft: 10 },
  goText: { color: 'white', fontWeight: 'bold' },
  preferenceRow: { flexDirection: 'row', marginTop: 15, justifyContent: 'space-between' },
  prefBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, marginHorizontal: 2, backgroundColor: '#F0F0F0' },
  prefBtnActive: { backgroundColor: '#E8F8F5', borderWidth: 1, borderColor: '#2ECC71' },
  prefBtnText: { color: '#7F8C8D', fontSize: 12 },
  prefBtnTextActive: { color: '#2ECC71', fontWeight: 'bold' },
  bottomPanel: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 10 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  sliderTitle: { fontWeight: 'bold' },
  sliderTime: { color: '#2ECC71', fontWeight: 'bold' },
  restMarker: { backgroundColor: 'white', padding: 5, borderRadius: 15, borderWidth: 1, borderColor: '#2ECC71' },
  arOverlay: { flex: 1, alignItems: 'center', paddingTop: 60, backgroundColor: 'rgba(0,0,0,0.2)' },
  arTitle: { color: '#2ECC71', fontSize: 20, fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 10 },
  closeBtn: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#E74C3C', padding: 15, borderRadius: 30 },
  closeText: { color: 'white', fontWeight: 'bold' },
  heatPoint: { position: 'absolute', alignItems: 'center' },
  coolBadge: { backgroundColor: 'rgba(46, 204, 113, 0.8)', padding: 8, borderRadius: 5, marginBottom: 5 },
  hotBadge: { backgroundColor: 'rgba(231, 76, 60, 0.8)', padding: 8, borderRadius: 5 },
  directionGuide: { position: 'absolute', bottom: 150, backgroundColor: 'rgba(52, 152, 219, 0.8)', padding: 20, borderRadius: 50 },
  guideText: { color: 'white', fontWeight: 'bold' }
});