import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Prevent instantiation
  AppTheme._();

  // Light Theme
  static ThemeData get lightTheme {
    final colorScheme = ColorScheme.light(
      primary: AppColors.primary600,
      onPrimary: Colors.white,
      primaryContainer: AppColors.primary100,
      onPrimaryContainer: AppColors.primary900,
      secondary: AppColors.accent600,
      onSecondary: Colors.white,
      secondaryContainer: AppColors.accent500.withOpacity(0.15),
      onSecondaryContainer: AppColors.accent600,
      error: AppColors.error500,
      onError: Colors.white,
      errorContainer: AppColors.error500.withOpacity(0.1),
      onErrorContainer: AppColors.error500,
      surface: Colors.white,
      onSurface: AppColors.neutral900,
      surfaceContainerHighest: AppColors.neutral100,
      onSurfaceVariant: AppColors.neutral500,
      outline: AppColors.neutral300,
      outlineVariant: AppColors.neutral200,
      shadow: Colors.black.withOpacity(0.05),
      scrim: Colors.black.withOpacity(0.5),
      inverseSurface: AppColors.neutral800,
      onInverseSurface: AppColors.neutral50,
      inversePrimary: AppColors.primary300,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.neutral50,
      textTheme: GoogleFonts.outfitTextTheme(),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.primary600,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        shadowColor: Colors.black.withOpacity(0.05),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary600,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary600,
          side: BorderSide(color: AppColors.primary600),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary600,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: false,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.neutral300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.neutral300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary600, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.error500),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: AppColors.primary100,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.primary600,
            );
          }
          return TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.neutral500,
          );
        }),
      ),
      dividerTheme: DividerThemeData(
        color: AppColors.neutral200,
        thickness: 1,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.white;
          }
          return AppColors.neutral300;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppColors.primary600;
          }
          return AppColors.neutral200;
        }),
      ),
    );
  }

  // Dark Theme
  static ThemeData get darkTheme {
    final colorScheme = ColorScheme.dark(
      primary: AppColors.primary400,
      onPrimary: AppColors.neutral900,
      primaryContainer: AppColors.primary800,
      onPrimaryContainer: AppColors.primary100,
      secondary: AppColors.accent500,
      onSecondary: AppColors.neutral900,
      secondaryContainer: AppColors.accent600.withOpacity(0.2),
      onSecondaryContainer: AppColors.accent500,
      error: AppColors.error500,
      onError: Colors.white,
      errorContainer: AppColors.error500.withOpacity(0.2),
      onErrorContainer: AppColors.error500,
      surface: const Color(0xFF1A1A1A),
      onSurface: AppColors.neutral100,
      surfaceContainerHighest: const Color(0xFF2A2A2A),
      onSurfaceVariant: AppColors.neutral400,
      outline: AppColors.neutral600,
      outlineVariant: AppColors.neutral700,
      shadow: Colors.black.withOpacity(0.3),
      scrim: Colors.black.withOpacity(0.7),
      inverseSurface: AppColors.neutral100,
      onInverseSurface: AppColors.neutral900,
      inversePrimary: AppColors.primary600,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFF121212),
      textTheme: GoogleFonts.outfitTextTheme(ThemeData.dark().textTheme),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.primary700,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: const Color(0xFF1A1A1A),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        shadowColor: Colors.black.withOpacity(0.3),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary600,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary400,
          side: BorderSide(color: AppColors.primary400),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary400,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF2A2A2A),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.neutral700),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.neutral700),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary400, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.error500),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: const Color(0xFF1A1A1A),
        indicatorColor: AppColors.primary800,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.primary400,
            );
          }
          return TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.neutral400,
          );
        }),
      ),
      dividerTheme: DividerThemeData(
        color: AppColors.neutral700,
        thickness: 1,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.white;
          }
          return AppColors.neutral600;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppColors.primary600;
          }
          return AppColors.neutral700;
        }),
      ),
    );
  }
}

// Color Palette (unchanged for reference)
class AppColors {
  AppColors._();

  // Primary - Teal/Emerald
  static const Color primary50 = Color(0xFFF0FDFA);
  static const Color primary100 = Color(0xFFCCFBF1);
  static const Color primary200 = Color(0xFF99F6E4);
  static const Color primary300 = Color(0xFF5EEAD4);
  static const Color primary400 = Color(0xFF2DD4BF);
  static const Color primary500 = Color(0xFF14B8A6);
  static const Color primary600 = Color(0xFF0D9488);
  static const Color primary700 = Color(0xFF0F766E);
  static const Color primary800 = Color(0xFF115E59);
  static const Color primary900 = Color(0xFF134E4A);

  // Accent - Coral/Orange
  static const Color accent500 = Color(0xFFF97316);
  static const Color accent600 = Color(0xFFEA580C);

  // Neutrals
  static const Color neutral50 = Color(0xFFFAFAF9);
  static const Color neutral100 = Color(0xFFF5F5F4);
  static const Color neutral200 = Color(0xFFE7E5E4);
  static const Color neutral300 = Color(0xFFD6D3D1);
  static const Color neutral400 = Color(0xFFA8A29E);
  static const Color neutral500 = Color(0xFF78716C);
  static const Color neutral600 = Color(0xFF57534E);
  static const Color neutral700 = Color(0xFF44403C);
  static const Color neutral800 = Color(0xFF292524);
  static const Color neutral900 = Color(0xFF1C1917);

  // Semantic
  static const Color success500 = Color(0xFF22C55E);
  static const Color error500 = Color(0xFFEF4444);
  static const Color warning500 = Color(0xFFEAB308);
}
