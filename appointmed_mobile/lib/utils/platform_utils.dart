import 'package:flutter/foundation.dart';

/// Utility class for platform detection
class PlatformUtils {
  /// Check if the current platform supports hover interactions
  /// Returns true for web and desktop platforms (Windows, macOS, Linux)
  static bool get supportsHover {
    return kIsWeb ||
        defaultTargetPlatform == TargetPlatform.windows ||
        defaultTargetPlatform == TargetPlatform.macOS ||
        defaultTargetPlatform == TargetPlatform.linux;
  }

  /// Check if the current platform is mobile
  static bool get isMobile {
    return defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;
  }
}
