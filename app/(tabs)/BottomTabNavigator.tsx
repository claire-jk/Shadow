import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

// 匯入你的首頁組件
import HomeScreen from './HomeScreen';

// --- 修正 Placeholder：確保不帶入會報錯的參數 ---
const Placeholder = ({ route }: any) => (
  <View style={styles.center}>
    <Text style={styles.text}>{route.name} 頁面開發中</Text>
  </View>
);

const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconSize = focused ? 26 : 22;
          
          // 根據路由名稱 (route.name) 決定圖示
          if (route.name === '首頁') {
            return <Ionicons name={focused ? "home" : "home-outline"} size={iconSize} color={color} />;
          } else if (route.name === '綠色停車') {
            return <MaterialCommunityIcons name={focused ? "leaf" : "leaf-circle-outline"} size={iconSize} color={color} />;
          } else if (route.name === '行人路徑') {
            return <FontAwesome5 name="walking" size={iconSize} color={color} />;
          } else if (route.name === '公車查詢') {
            return <Ionicons name={focused ? "bus" : "bus-outline"} size={iconSize} color={color} />;
          } else if (route.name === '待轉指引') {
            return <MaterialCommunityIcons name="moped" size={iconSize} color={color} />;
          }
          return <Ionicons name="help-circle" size={iconSize} color={color} />;
        },
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginBottom: Platform.OS === 'ios' ? 0 : 5,
        },
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 88 : 70,
          paddingTop: 10,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="首頁" component={HomeScreen} />
      <Tab.Screen name="綠色停車" component={Placeholder} />
      <Tab.Screen name="行人路徑" component={Placeholder} />
      <Tab.Screen name="公車查詢" component={Placeholder} />
      <Tab.Screen name="待轉指引" component={Placeholder} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  text: { fontSize: 18, color: '#64748B', fontWeight: '600' }
});

// 注意：這裡後面絕對不能有任何 return 語句！