import 'package:flutter/material.dart';
import '../utils/platform_utils.dart';

/// A button wrapper that applies appropriate hover scale animation
/// based on button type (primary, secondary, text, icon)
class HoverButton extends StatefulWidget {
  const HoverButton({
    super.key,
    required this.child,
    this.scale,
    this.duration = const Duration(milliseconds: 200),
    this.curve = Curves.easeOut,
    this.isPrimary = true,
  });

  /// The button widget to wrap
  final Widget child;

  /// Custom scale factor (overrides automatic selection)
  /// If null, scale is determined by isPrimary
  final double? scale;

  /// Animation duration
  final Duration duration;

  /// Animation curve
  final Curve curve;

  /// Whether this is a primary button (grows on hover)
  /// If false, button shrinks slightly on hover
  final bool isPrimary;

  @override
  State<HoverButton> createState() => _HoverButtonState();
}

class _HoverButtonState extends State<HoverButton> {
  bool _isHovered = false;

  double get _effectiveScale {
    if (widget.scale != null) return widget.scale!;
    return widget.isPrimary ? 1.04 : 0.98;
  }

  @override
  Widget build(BuildContext context) {
    // Skip hover effects on mobile platforms
    if (!PlatformUtils.supportsHover) {
      return widget.child;
    }

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      cursor: SystemMouseCursors.click,
      child: AnimatedScale(
        scale: _isHovered ? _effectiveScale : 1.0,
        duration: widget.duration,
        curve: widget.curve,
        child: widget.child,
      ),
    );
  }
}

/// Specialized hover wrapper for primary buttons (ElevatedButton, FilledButton)
/// Grows on hover (scale: 1.03 - 1.05)
class HoverPrimaryButton extends StatelessWidget {
  const HoverPrimaryButton({
    super.key,
    required this.child,
    this.scale = 1.04,
    this.duration = const Duration(milliseconds: 200),
  });

  final Widget child;
  final double scale;
  final Duration duration;

  @override
  Widget build(BuildContext context) {
    return HoverButton(
      scale: scale,
      duration: duration,
      isPrimary: true,
      child: child,
    );
  }
}

/// Specialized hover wrapper for secondary buttons (OutlinedButton, TextButton)
/// Shrinks slightly on hover (scale: 0.97 - 0.99)
class HoverSecondaryButton extends StatelessWidget {
  const HoverSecondaryButton({
    super.key,
    required this.child,
    this.scale = 0.98,
    this.duration = const Duration(milliseconds: 200),
  });

  final Widget child;
  final double scale;
  final Duration duration;

  @override
  Widget build(BuildContext context) {
    return HoverButton(
      scale: scale,
      duration: duration,
      isPrimary: false,
      child: child,
    );
  }
}

/// Specialized hover wrapper for icon buttons
/// Minimal grow on hover (scale: 1.08)
class HoverIconButton extends StatelessWidget {
  const HoverIconButton({
    super.key,
    required this.child,
    this.scale = 1.08,
    this.duration = const Duration(milliseconds: 150),
  });

  final Widget child;
  final double scale;
  final Duration duration;

  @override
  Widget build(BuildContext context) {
    return HoverButton(
      scale: scale,
      duration: duration,
      isPrimary: true,
      child: child,
    );
  }
}
