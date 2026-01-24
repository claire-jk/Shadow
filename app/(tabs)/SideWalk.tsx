import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import SunCalc from 'suncalc';

const { width } = Dimensions.get('window');

// API Key (OpenRouteService)
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImZhNjJiMDJhOTQ1NTQ3M2Q4NDRiYmMzMjVkM2UxMGVmIiwiaCI6Im11cm11cjY0In0=';

export default function CoolingCorridorApp() {
  const mapRef = useRef<MapView>(null);
  const [startPoint, setStartPoint] = useState<any>(null);
  const [destination, setDestination] = useState<any>(null);
  const [destText, setDestText] = useState('');
  const [routeCoords, setRouteCoords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routePreference, setRoutePreference] = useState<'fast' | 'cool' | 'balanced'>('cool');
  const [timeOffset, setTimeOffset] = useState(0); 
  
  const [realBuildings, setRealBuildings] = useState<any[]>([]);
  const [shadowPolygons, setShadowPolygons] = useState<any[]>([]);
  const [poiMarkers, setPoiMarkers] = useState<any[]>([]); 

  useEffect(() => {
    (async () => {
      await autoLocate();
    })();
  }, []);

  useEffect(() => {
    renderShadows();
    if (destination) {
      handlePlanRoute(); 
    }
  }, [timeOffset, routePreference]);

  const autoLocate = async () => {
    setIsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setStartPoint(coord);
      fetchOSMData(coord.latitude, coord.longitude);
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.008, longitudeDelta: 0.008 });
    } catch (e) {
      Alert.alert('定位失敗', '請確認 GPS 是否開啟');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOSMData = async (lat: number, lng: number) => {
    // 擴大搜索半徑至 1500 米，增加地標出現機率
    const query = `[out:json];(way["building"](around:800,${lat},${lng});node["amenity"="drinking_water"](around:1500,${lat},${lng});node["shop"="convenience"](around:1500,${lat},${lng}););out body;>;out skel qt;`;
    try {
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await res.json();
      const nodesMap: any = {};
      const newPois: any[] = [];
      
      data.elements.forEach((el: any) => {
        if (el.type === 'node') {
          nodesMap[el.id] = { latitude: el.lat, longitude: el.lon };
          // 判定 POI 類型
          const isWater = el.tags?.amenity === 'drinking_water';
          const isStore = el.tags?.shop === 'convenience';
          
          if (isWater || isStore) {
            newPois.push({
              id: `poi-${el.id}`,
              latitude: el.lat,
              longitude: el.lon,
              type: isWater ? 'water' : 'store',
              name: el.tags?.name || (isWater ? '飲水機' : '便利商店')
            });
          }
        }
      });

      const buildings = data.elements.filter((el: any) => el.type === 'way' && el.nodes)
        .map((way: any) => ({
          id: way.id,
          height: parseFloat(way.tags?.height) || (parseInt(way.tags?.['building:levels']) * 3.5) || 15,
          coords: way.nodes.map((nodeId: any) => nodesMap[nodeId]).filter((n: any) => n),
        })).filter((b: any) => b.coords.length > 2);

      console.log(`成功載入 POI 數量: ${newPois.length}`);
      setRealBuildings(buildings);
      setPoiMarkers(newPois);
    } catch (e) { 
      console.log("OSM Data Fetch Error:", e); 
    }
  };

  const renderShadows = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + timeOffset);
    const shadows = realBuildings.map(bldg => {
      const sunPos = SunCalc.getPosition(date, bldg.coords[0].latitude, bldg.coords[0].longitude);
      if (sunPos.altitude <= 0) return null;
      const shadowLen = (bldg.height / Math.tan(sunPos.altitude)) / 111000;
      const dx = shadowLen * Math.sin(sunPos.azimuth + Math.PI);
      const dy = shadowLen * Math.cos(sunPos.azimuth + Math.PI);
      const projected = bldg.coords.map((c: any) => ({ latitude: c.latitude + dy, longitude: c.longitude + dx }));
      return [...bldg.coords, ...projected.reverse()];
    }).filter(Boolean);
    setShadowPolygons(shadows);
  };

  const handlePlanRoute = async () => {
    if (!startPoint || (!destText && !destination)) return;
    setIsLoading(true);
    try {
      let finalDest = destination;
      if (!destination) {
        const destGeo = await Location.geocodeAsync(destText);
        if (destGeo.length === 0) throw new Error("No location found");
        finalDest = { latitude: destGeo[0].latitude, longitude: destGeo[0].longitude };
        setDestination(finalDest);
      }

      let profile = 'foot-walking';
      let preference = routePreference === 'fast' ? 'fastest' : 'shortest';
      let avoidFeatures = routePreference === 'cool' ? '["highways","steps"]' : '[]';

      const url = `https://api.openrouteservice.org/v2/directions/${profile}?api_key=${ORS_API_KEY}&start=${startPoint.longitude},${startPoint.latitude}&end=${finalDest.longitude},${finalDest.latitude}&preference=${preference}&options={"avoid_features":${avoidFeatures}}`;
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.features && json.features.length > 0) {
        const points = json.features[0].geometry.coordinates.map((p: any) => ({ latitude: p[1], longitude: p[0] }));
        setRouteCoords(points);
      }
    } catch (e) {
      Alert.alert("搜尋錯誤", "找不到該地點，請輸入更詳細的地址或路名");
    } finally {
      setIsLoading(false);
    }
  };

  const getRouteColor = () => {
    if (routePreference === 'cool') return '#2ECC71';
    if (routePreference === 'balanced') return '#F1C40F';
    return '#3498DB';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.headerContainer}>
        <View style={styles.searchCard}>
          <TextInput 
            style={styles.searchInput} 
            placeholder="📍 搜尋目的地 (例: 台北 101)" 
            placeholderTextColor="#95A5A6"
            value={destText} 
            onChangeText={setDestText}
            onSubmitEditing={handlePlanRoute}
          />
          <TouchableOpacity onPress={handlePlanRoute} style={[styles.searchBtn, { backgroundColor: getRouteColor() }]}>
            {isLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>GO</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.modeToggleContainer}>
          {[
            { id: 'fast', label: '⚡ 最快', color: '#3498DB'},
            { id: 'cool', label: '🌿 涼爽', color: '#2ECC71' },
            { id: 'balanced', label: '⚖️ 均衡', color: '#F1C40F' }
          ].map((mode) => (
            <TouchableOpacity 
              key={mode.id} 
              onPress={() => setRoutePreference(mode.id as any)}
              style={[
                styles.modeTab, 
                routePreference === mode.id && { backgroundColor: mode.color, borderColor: mode.color }
              ]}
            >
              <Text style={[styles.modeTabText, routePreference === mode.id && styles.activeModeText]}>
                {mode.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <MapView 
        ref={mapRef} 
        style={styles.map} 
        provider={PROVIDER_GOOGLE} 
        showsUserLocation
        showsCompass={false}
      >
        {destination && (
          <Marker coordinate={destination} title="目的地" zIndex={99}>
            <View style={styles.destMarker}><Text style={{fontSize: 18}}>🏁</Text></View>
          </Marker>
        )}
        
        {/* 渲染飲水機與商店 */}
        {poiMarkers.map((poi) => (
          <Marker 
            key={poi.id} 
            coordinate={{ latitude: poi.latitude, longitude: poi.longitude }} 
            title={poi.name}
            zIndex={10}
          >
            <View style={[styles.poiBadge, { backgroundColor: poi.type === 'water' ? '#3498DB' : '#E67E22' }]}>
              <Text style={styles.poiIconText}>{poi.type === 'water' ? '💧' : '🏪'}</Text>
            </View>
          </Marker>
        ))}

        {shadowPolygons.map((poly, idx) => (
          <Polygon key={`shd-${idx}`} coordinates={poly} fillColor="rgba(44, 62, 80, 0.35)" strokeWidth={0} />
        ))}

        {routeCoords.length > 0 && (
          <Polyline 
            coordinates={routeCoords} 
            strokeWidth={6} 
            strokeColor={getRouteColor()} 
            lineCap="round"
          />
        )}
      </MapView>

      <View style={styles.bottomCard}>
        <View style={styles.timeHeader}>
          <View>
            <Text style={styles.timeTitle}>街道陰影預測</Text>
            <Text style={styles.timeSub}>拖動預覽未來時段的涼爽路徑</Text>
          </View>
          <Text style={[styles.timeDisplay, { color: getRouteColor() }]}>
            {timeOffset === 0 ? '現在' : `+${timeOffset} 分鐘`}
          </Text>
        </View>
        
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={180}
          step={30}
          value={timeOffset}
          onValueChange={setTimeOffset}
          minimumTrackTintColor={getRouteColor()}
          maximumTrackTintColor="#ECF0F1"
          thumbTintColor={getRouteColor()}
        />

        <View style={styles.legend}>
          <View style={styles.legendRow}><Text>💧</Text><Text style={styles.legendText}>飲水機</Text></View>
          <View style={styles.legendRow}><Text>🏪</Text><Text style={styles.legendText}>便利商店</Text></View>
          <View style={styles.legendRow}><View style={styles.shadowBox}/><Text style={styles.legendText}>預測陰影</Text></View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  map: { ...StyleSheet.absoluteFillObject },
  headerContainer: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 20, right: 20, zIndex: 10
  },
  searchCard: {
    flexDirection: 'row', backgroundColor: '#FFF',
    borderRadius: 20, padding: 6, elevation: 10, shadowColor: '#000',
    shadowOpacity: 0.1, shadowRadius: 10, alignItems: 'center'
  },
  searchInput: { flex: 1, height: 45, paddingHorizontal: 15, fontSize: 15, color: '#2C3E50', fontFamily: 'Zen' },
  searchBtn: {
    paddingHorizontal: 20, height: 40, borderRadius: 15, justifyContent: 'center', alignItems: 'center'
  },
  btnText: { color: '#fff', fontFamily: 'Zen' },
  modeToggleContainer: {
    flexDirection: 'row', marginTop: 12, justifyContent: 'space-between'
  },
  modeTab: {
    flex: 0.31, backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 10,
    borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FFF',
    elevation: 4, shadowOpacity: 0.1
  },
  modeTabText: { fontSize: 13, color: '#7F8C8D', fontWeight: 'bold', fontFamily: 'Zen' },
  activeModeText: { color: '#FFF', fontFamily: 'Zen' },
  bottomCard: {
    position: 'absolute', bottom: 35, left: 20, right: 20,
    backgroundColor: '#ffffffe6', borderRadius: 25, padding: 20,
    elevation: 15, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15
  },
  timeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  timeTitle: { fontSize: 18, color: '#2C3E50', fontFamily: 'Zen' },
  timeSub: { fontSize: 11, color: '#95A5A6', marginTop: 2, fontFamily: 'Zen' },
  timeDisplay: { fontSize: 16, fontWeight: 'bold', fontFamily: 'Zen' },
  slider: { width: '100%', height: 40 },
  legend: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, borderTopWidth: 1, borderTopColor: '#F2F2F2', paddingTop: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  legendText: { fontSize: 11, color: '#7F8C8D', marginLeft: 4, fontFamily: 'Zen' },
  shadowBox: { width: 12, height: 12, backgroundColor: 'rgba(44, 62, 80, 0.4)', borderRadius: 2 },
  poiBadge: {
    padding: 6, borderRadius: 15, borderWidth: 2, borderColor: '#FFF',
    elevation: 6, shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }
  },
  poiIconText: { fontSize: 14, fontFamily: 'Zen' },
  destMarker: {
    backgroundColor: '#FFF', padding: 6, borderRadius: 50, elevation: 10,
    borderWidth: 3, borderColor: '#E74C3C', justifyContent: 'center', alignItems: 'center'
  }
});