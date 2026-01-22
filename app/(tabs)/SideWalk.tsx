import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Keyboard, Modal, StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import SunCalc from 'suncalc';

const { width, height } = Dimensions.get('window');

// API Key
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImZhNjJiMDJhOTQ1NTQ3M2Q4NDRiYmMzMjVkM2UxMGVmIiwiaCI6Im11cm11cjY0In0=';

// --- AR 實景組件 ---
function ARModeView({ visible, onClose, rotation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  if (!permission?.granted) {
    return (
      <Modal visible={visible}>
        <View style={styles.centered}>
          <Text style={{ marginBottom: 20 }}>需要相機權限才能開啟 AR 導航</Text>
          <TouchableOpacity style={styles.goButton} onPress={requestPermission}>
            <Text style={styles.goText}>授權權限</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 20 }} onPress={onClose}><Text>關閉</Text></TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="fade">
      <View style={{ flex: 1 }}>
        <CameraView style={{ flex: 1 }} facing="back">
          <View style={styles.arOverlay}>
            <View style={styles.arHeader}>
              <Text style={styles.arTitle}>👓 AR 實景涼爽偵測</Text>
            </View>
            <View style={[styles.heatPoint, { transform: [{ translateY: rotation.beta * 200 }, { translateX: rotation.gamma * 200 }] }]}>
              <View style={styles.coolBadge}><Text style={styles.badgeText}>🌿 偵測到建築陰影</Text></View>
              <View style={styles.hotBadge}><Text style={styles.badgeText}>🔥 柏油路高溫預警</Text></View>
            </View>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>返回地圖</Text></TouchableOpacity>
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
  
  // OSM 建築數據與渲染陰影
  const [realBuildings, setRealBuildings] = useState<any[]>([]);
  const [shadowPolygons, setShadowPolygons] = useState<any[]>([]);
  const [isARVisible, setIsARVisible] = useState(false);
  const [rotation, setRotation] = useState({ alpha: 0, beta: 0, gamma: 0 });

  useEffect(() => {
    autoLocate();
    DeviceMotion.setUpdateInterval(100);
    const sub = DeviceMotion.addListener((data) => setRotation(data.rotation));
    return () => sub.remove();
  }, []);

  // 當時間偏移或建築數據更新時，重新投影陰影
  useEffect(() => {
    renderShadows();
  }, [timeOffset, realBuildings]);

  const autoLocate = async () => {
    setIsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setStartPoint(coord);
      setStartText('我的目前位置');
      fetchOSMBuildings(coord.latitude, coord.longitude);
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.005, longitudeDelta: 0.005 });
    } catch (e) {
      Alert.alert('錯誤', '無法獲取位置');
    } finally {
      setIsLoading(false);
    }
  };

  // 1. 從 Overpass API 抓取真實建築物
  const fetchOSMBuildings = async (lat: number, lng: number) => {
    const query = `
      [out:json][timeout:25];
      (
        way["building"](around:500, ${lat}, ${lng});
        relation["building"](around:500, ${lat}, ${lng});
      );
      out body; >; out skel qt;`;
    
    try {
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      const nodesMap: any = {};
      data.elements.forEach((el: any) => {
        if (el.type === 'node') nodesMap[el.id] = { latitude: el.lat, longitude: el.lon };
      });

      const buildings = data.elements
        .filter((el: any) => el.type === 'way' && el.nodes)
        .map((way: any) => ({
          id: way.id,
          height: parseFloat(way.tags.height) || (parseInt(way.tags['building:levels']) * 3.5) || 12,
          coords: way.nodes.map((nodeId: any) => nodesMap[nodeId]).filter((n: any) => n),
          isArcade: way.tags.covered === 'yes' || way.tags.arcade === 'yes'
        }));
      
      setRealBuildings(buildings);
    } catch (e) {
      console.log("OSM Fetch Error", e);
    }
  };

  // 2. 計算陰影投射
  const renderShadows = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + timeOffset);
    
    const shadows = realBuildings.map(bldg => {
      const sunPos = SunCalc.getPosition(date, bldg.coords[0].latitude, bldg.coords[0].longitude);
      if (sunPos.altitude <= 0) return null;

      const shadowLen = (bldg.height / Math.tan(sunPos.altitude)) / 111000;
      const dx = shadowLen * Math.sin(sunPos.azimuth + Math.PI);
      const dy = shadowLen * Math.cos(sunPos.azimuth + Math.PI);

      // 將原始座標偏移生成陰影頂點
      const projected = bldg.coords.map((c: any) => ({
        latitude: c.latitude + dy,
        longitude: c.longitude + dx
      }));

      return [...bldg.coords, ...projected.reverse()];
    }).filter(Boolean);

    setShadowPolygons(shadows);
  };

  const handlePlanRoute = async () => {
    if (!destText) return;
    setIsLoading(true);
    try {
      const destGeo = await Location.geocodeAsync(destText);
      const finalDest = { latitude: destGeo[0].latitude, longitude: destGeo[0].longitude };
      setDestination(finalDest);

      const url = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${startPoint.longitude},${startPoint.latitude}&end=${finalDest.longitude},${finalDest.latitude}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.features) {
        const points = json.features[0].geometry.coordinates.map((p: any) => ({ latitude: p[1], longitude: p[0] }));
        setRouteCoords(points);
        mapRef.current?.fitToCoordinates(points, { edgePadding: { top: 150, bottom: 450, left: 80, right: 80 } });
        // 到達目的地附近也抓建築
        fetchOSMBuildings(finalDest.latitude, finalDest.longitude);
      }
    } catch (e) {
      Alert.alert("錯誤", "路徑規劃失敗");
    } finally {
      setIsLoading(false);
      Keyboard.dismiss();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} placeholder="起點: 我的目前位置" value={startText} onChangeText={setStartText} />
          <TouchableOpacity onPress={autoLocate} style={styles.locateBtn}><Text>📍</Text></TouchableOpacity>
        </View>
        <View style={[styles.inputRow, { marginTop: 10 }]}>
          <TextInput style={styles.input} placeholder="輸入目的地" value={destText} onChangeText={setDestText} onSubmitEditing={handlePlanRoute} />
          <TouchableOpacity onPress={() => setIsARVisible(true)} style={styles.arButton}><Text style={styles.arText}>👓 AR</Text></TouchableOpacity>
          <TouchableOpacity onPress={handlePlanRoute} style={styles.goButton}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.goText}>GO</Text>}
          </TouchableOpacity>
        </View>
        <View style={styles.preferenceRow}>
          {(['fast', 'cool', 'shaded'] as const).map((pref) => (
            <TouchableOpacity key={pref} onPress={() => setRoutePreference(pref)} style={[styles.prefBtn, routePreference === pref && styles.prefBtnActive]}>
              <Text style={[styles.prefBtnText, routePreference === pref && styles.prefBtnTextActive]}>
                {pref === 'fast' ? '⚡ 最快' : pref === 'cool' ? '🌿 涼爽' : '🏠 騎樓'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <MapView ref={mapRef} style={styles.map} provider={PROVIDER_GOOGLE} showsUserLocation={true}>
        {startPoint && <Marker coordinate={startPoint} title="起點" pinColor="#3498DB" />}
        {destination && <Marker coordinate={destination} title="目的地" pinColor="#E74C3C" />}
        {shadowPolygons.map((poly, idx) => (
          <Polygon key={idx} coordinates={poly} fillColor="rgba(0, 0, 0, 0.3)" strokeWidth={0} />
        ))}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeWidth={6} strokeColor={routePreference === 'cool' ? '#2ECC71' : routePreference === 'shaded' ? '#9B59B6' : '#3498DB'} />
        )}
      </MapView>

      <ARModeView visible={isARVisible} onClose={() => setIsARVisible(false)} rotation={rotation} />

      <View style={styles.bottomPanel}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderTitle}>🕒 街道陰影偏移預測</Text>
          <Text style={styles.sliderTime}>+{timeOffset} 分鐘後</Text>
        </View>
        <Slider style={{ width: '100%', height: 40 }} minimumValue={0} maximumValue={120} step={15} value={timeOffset} onValueChange={setTimeOffset} minimumTrackTintColor="#2ECC71" thumbTintColor="#2ECC71" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  searchContainer: { position: 'absolute', top: 50, left: 15, right: 15, backgroundColor: 'white', borderRadius: 16, padding: 15, zIndex: 100, elevation: 5 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, height: 45, backgroundColor: '#F8F9FA', borderRadius: 10, paddingHorizontal: 15 },
  locateBtn: { padding: 10 },
  arButton: { backgroundColor: '#34495E', padding: 12, borderRadius: 10, marginLeft: 8 },
  arText: { color: 'white', fontWeight: 'bold' },
  goButton: { backgroundColor: '#2ECC71', padding: 12, borderRadius: 10, marginLeft: 8 },
  goText: { color: 'white', fontWeight: 'bold' },
  preferenceRow: { flexDirection: 'row', marginTop: 15 },
  prefBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginHorizontal: 4, backgroundColor: '#F0F2F5' },
  prefBtnActive: { backgroundColor: '#E8F8F5', borderWidth: 1, borderColor: '#2ECC71' },
  prefBtnText: { color: '#666', fontSize: 12 },
  prefBtnTextActive: { color: '#2ECC71', fontWeight: 'bold' },
  bottomPanel: { position: 'absolute', bottom: 30, left: 15, right: 15, backgroundColor: 'white', borderRadius: 16, padding: 20, elevation: 10 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  sliderTitle: { fontWeight: '600' },
  sliderTime: { color: '#2ECC71', fontWeight: 'bold' },
  arOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)', paddingTop: 80, alignItems: 'center' },
  arHeader: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 12 },
  arTitle: { color: '#2ECC71', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#E74C3C', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30 },
  closeText: { color: 'white', fontWeight: 'bold' },
  heatPoint: { position: 'absolute', top: height / 3, alignItems: 'center' },
  coolBadge: { backgroundColor: 'rgba(46, 204, 113, 0.9)', padding: 10, borderRadius: 8, marginBottom: 10 },
  hotBadge: { backgroundColor: 'rgba(231, 76, 60, 0.9)', padding: 10, borderRadius: 8 },
  badgeText: { color: 'white', fontWeight: 'bold' },
});