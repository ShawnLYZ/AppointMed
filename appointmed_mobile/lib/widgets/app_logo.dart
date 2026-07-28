import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The AppointMed brand mark, rendered from `assets/images/app_icon.png` —
/// the same artwork the Android launcher icon is generated from.
///
/// Example:
/// ```dart
/// const AppLogo(size: 80)
/// ```
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 64, this.borderRadius});

  /// Width and height of the (square) mark, in logical pixels.
  final double size;

  /// Corner rounding. Defaults to 19% of [size], measured off the rounding
  /// already baked into the artwork — so the clip is a no-op on the image and
  /// only shapes the fallback below.
  final double? borderRadius;

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? size * 0.19;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.asset(
        'assets/images/app_icon.png',
        width: size,
        height: size,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.medium,
        // If the asset ever goes missing, fall back to the brand gradient
        // rather than showing a broken-image box.
        errorBuilder: (_, __, ___) => Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.primary500, AppColors.primary700],
            ),
          ),
          child: Icon(Icons.medical_services_outlined,
              size: size / 2, color: Colors.white),
        ),
      ),
    );
  }
}
