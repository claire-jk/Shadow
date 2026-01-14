import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BottomTabNavigator from './BottomTabNavigator';

export default function Index() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* 這裡直接放 Navigator，不要包 NavigationContainer */}
      <BottomTabNavigator />
    </SafeAreaProvider>
  );
}