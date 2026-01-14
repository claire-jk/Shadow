import { NavigationContainer, NavigationIndependentTree } from '@react-navigation/native'; // 引入 NavigationIndependentTree
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 引入字體
import { Caveat_400Regular, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { CormorantGaramond_400Regular, CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { useFonts, ZenKurenaido_400Regular } from '@expo-google-fonts/zen-kurenaido';

import BottomTabNavigator from './BottomTabNavigator';

SplashScreen.preventAutoHideAsync();

export default function Index() {
  const [fontsLoaded, fontError] = useFonts({
    'Zen': ZenKurenaido_400Regular,
    'CormorantGaramond': CormorantGaramond_400Regular,
    'CormorantGaramond-Bold': CormorantGaramond_700Bold,
    'Caveat': Caveat_400Regular,
    'Caveat-Bold': Caveat_700Bold,
    'GreatVibes': GreatVibes_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* 修正重點：使用 NavigationIndependentTree 包裹 NavigationContainer */}
      <NavigationIndependentTree>
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      </NavigationIndependentTree>
    </SafeAreaProvider>
  );
}