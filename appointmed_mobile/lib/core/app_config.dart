import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  AppConfig._();

  // PLACEHOLDERS — replace the two `YOUR_...` values below with your own
  // Supabase project's Project URL and anon/public key. See README.md §6
  // Part D (D4).
  //
  // Only ever put the anon/PUBLIC key here. It is compiled into the shipped app
  // and is readable by anyone who has the binary; the service_role/secret key
  // must never appear in this file.
  //
  // Alternative to editing this file: pass them at build time instead, e.g.
  //   flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://gkbleklehgcsrxptolhe.supabase.co',
  );
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrYmxla2xlaGdjc3J4cHRvbGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDEwOTcsImV4cCI6MjA5ODQxNzA5N30.dPB0uYmxEnE309-v7DohugErLi-PMMblyj9UIEO8e_o',
  );

  /// False while either value above is still a `YOUR_...` placeholder.
  static bool get isConfigured =>
      !supabaseUrl.contains('YOUR_') && !supabaseAnonKey.contains('YOUR_');

  /// Android emulator reaches the host machine via 10.0.2.2.
  static String get engineBaseUrl {
    if (kIsWeb) return 'http://localhost:8080';
    if (Platform.isAndroid) return 'http://10.0.2.2:8080';
    return 'http://localhost:8080';
  }

  // SharedPreferences keys (moved from constants.dart, which dies in Task 5).
  static const String keyOnboardingDone = 'onboarding_done';
}
