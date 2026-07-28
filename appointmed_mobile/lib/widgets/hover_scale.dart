import 'package:flutter/material.dart';
import '../utils/platform_utils.dart';

/// A lightweight wrapper that applies scale-on-hover animation
/// to any child widget. Only active on web and desktop platforms.
/// 
/// Example:
/// ```dart
/// HoverScale(
///   scale: 1.03,
///   child: YourWidget(),
/// )
/// ```
class HoverScale extends StatefulWidget {
  const HoverScale({
    super.key,
    required this.child,
    this.scale = 1.01,
    this.duration = const Duration(milliseconds: 200),
    this.curve = Curves.easeOut,
    this.onTap,
  });

  /// The widget to apply hover scaling to
  final Widget child;

  /// Scale factor when hovered (recommended: 1.02 - 1.05)
  final double scale;

  /// Animation duration (recommended: 150ms - 250ms)
  final Duration duration;

  /// Animation curve
  final Curve curve;

  /// Optional tap callback
  final VoidCallback? onTap;

  @override
  State<HoverScale> createState() => _HoverScaleState();
}

class _HoverScaleState extends State<HoverScale> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    // Skip hover effects on mobile platforms
    if (!PlatformUtils.supportsHover) {
      return widget.onTap != null
          ? GestureDetector(onTap: widget.onTap, child: widget.child)
          : widget.child;
    }

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      cursor: widget.onTap != null
          ? SystemMouseCursors.click
          : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _isHovered ? widget.scale : 1.0,
          duration: widget.duration,
          curve: widget.curve,
          child: widget.child,
        ),
      ),
    );
  }
}
