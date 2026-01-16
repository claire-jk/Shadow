import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, Text, View } from 'react-native';
import Bus from './Bus';
import GreenParkEngine from './GreenParkingEngine';
import HomeScreen from './HomeScreen';
import SideWalk from './SideWalk';

const Placeholder = ({ route }: any) => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ fontSize: 18, fontFamily: 'ZenKurenaido' }}>{route.name} 頁面開發中</Text>
  </View>
);

const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconSize = focused ? 26 : 22;
          if (route.name === '首頁') return <Ionicons name={focused ? "home" : "home-outline"} size={iconSize} color={color} />;
          if (route.name === '綠色停車') return <MaterialCommunityIcons name={focused ? "leaf" : "leaf-circle-outline"} size={iconSize} color={color} />;
          if (route.name === '行人路徑') return <FontAwesome5 name="walking" size={iconSize} color={color} />;
          if (route.name === '公車查詢') return <Ionicons name={focused ? "bus" : "bus-outline"} size={iconSize} color={color} />;
          if (route.name === '待轉指引') return <MaterialCommunityIcons name="moped" size={iconSize} color={color} />;
          return <Ionicons name="help-circle" size={iconSize} color={color} />;
        },
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarLabelStyle: { fontFamily: 'ZenKurenaido', fontSize: 12, marginBottom: Platform.OS === 'ios' ? 0 : 5 },
        tabBarStyle: { height: Platform.OS === 'ios' ? 88 : 70, paddingTop: 10, backgroundColor: '#FFFFFF', borderTopWidth: 0 },
        headerShown: false,
      })}
    >
      <Tab.Screen name="首頁" component={HomeScreen} />
      <Tab.Screen name="綠色停車" component={GreenParkEngine} />
      <Tab.Screen name="行人路徑" component={SideWalk} />
      <Tab.Screen name="公車查詢" component={Bus} />
      <Tab.Screen name="待轉指引" component={Placeholder} />
    </Tab.Navigator>
  );
}