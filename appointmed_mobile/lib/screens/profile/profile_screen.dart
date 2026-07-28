import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/theme_provider.dart';
import '../../providers/auth_provider.dart';
import '../auth/sign_in_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  void _showEditDialog(String field, String label, String current) {
    final ctrl = TextEditingController(text: current);
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Edit $label'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: InputDecoration(labelText: label),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (ctrl.text.trim().isNotEmpty) {
                final auth = context.read<AuthProvider>();
                await auth.updateProfile({field: ctrl.text.trim()});
                if (auth.error != null && mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(auth.error!)));
                }
              }
              if (mounted) Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showSignOutDialog() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Sign Out'),
        content: const Text(
            'Are you sure you want to sign out of your account?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              await context.read<AuthProvider>().signOut();
              if (mounted) {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => const SignInScreen()),
                  (_) => false,
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error500,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final auth = context.watch<AuthProvider>();
    final user = auth.userModel;

    return Scaffold(
      backgroundColor: colorScheme.surfaceContainerHighest,
      appBar: AppBar(title: const Text('Profile')),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.primary600, AppColors.primary700],
                ),
              ),
              child: Column(
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 3)),
                    child: CircleAvatar(
                      radius: 38,
                      backgroundColor: AppColors.primary100,
                      backgroundImage: user?.avatarUrl != null
                          ? NetworkImage(user!.avatarUrl!)
                          : null,
                      child: user?.avatarUrl == null
                          ? Text(
                              user?.initials ?? '?',
                              style: const TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.primary600),
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(user?.fullName ?? 'User',
                      style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: Colors.white)),
                  const SizedBox(height: 4),
                  Text(user?.email ?? '',
                      style: TextStyle(
                          fontSize: 14,
                          color: Colors.white.withOpacity(0.9))),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Personal Info
                  _section('Personal Info', colorScheme),
                  _card(colorScheme, [
                    _item(colorScheme,
                        icon: Icons.person_outline,
                        title: 'Full Name',
                        subtitle: user?.fullName ?? '',
                        onTap: () => _showEditDialog(
                            'full_name', 'Full Name', user?.fullName ?? '')),
                    _div(colorScheme),
                    _item(colorScheme,
                        icon: Icons.badge_outlined,
                        title: 'Passport Number',
                        subtitle: user?.passport ?? ''),
                    _div(colorScheme),
                    _item(colorScheme,
                        icon: Icons.phone_outlined,
                        title: 'Phone Number',
                        subtitle: user?.phone ?? '',
                        onTap: () => _showEditDialog(
                            'phone', 'Phone Number', user?.phone ?? '')),
                    _div(colorScheme),
                    _item(colorScheme,
                        icon: Icons.email_outlined,
                        title: 'Email Address',
                        subtitle: user?.email ?? ''),
                  ]),

                  const SizedBox(height: 24),

                  // Appearance
                  _section('Appearance', colorScheme),
                  _card(colorScheme, [_themeSelector(context, colorScheme)]),

                  const SizedBox(height: 24),

                  // Notifications
                  _section('Notifications', colorScheme),
                  _card(colorScheme, [
                    _toggle(colorScheme,
                        icon: Icons.notifications_outlined,
                        title: 'Appointment Reminders',
                        isOn: true),
                    _div(colorScheme),
                    _toggle(colorScheme,
                        icon: Icons.recommend_outlined,
                        title: 'AI Recommendations',
                        isOn: false),
                  ]),

                  const SizedBox(height: 24),

                  // About
                  _section('About', colorScheme),
                  _card(colorScheme, [
                    _item(colorScheme,
                        icon: Icons.info_outline,
                        title: 'App Version',
                        subtitle: '1.0.0'),
                  ]),

                  const SizedBox(height: 24),

                  // Sign Out
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _showSignOutDialog,
                      icon: const Icon(Icons.logout, size: 20),
                      label: const Text('Sign Out'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.error500,
                        foregroundColor: Colors.white,
                        padding:
                            const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, ColorScheme cs) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 12),
        child: Text(title,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: cs.onSurfaceVariant)),
      );

  Widget _card(ColorScheme cs, List<Widget> children) => Container(
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
                color: cs.shadow,
                blurRadius: 10,
                offset: const Offset(0, 2))
          ],
        ),
        child: Column(children: children),
      );

  Widget _item(
    ColorScheme cs, {
    required IconData icon,
    required String title,
    String? subtitle,
    IconData? trailing,
    VoidCallback? onTap,
  }) =>
      ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
              color: cs.primaryContainer,
              borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 20, color: cs.primary),
        ),
        title: Text(title,
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: cs.onSurface)),
        subtitle: subtitle != null
            ? Text(subtitle,
                style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant))
            : null,
        trailing: trailing != null
            ? Icon(trailing, size: 20, color: cs.onSurfaceVariant)
            : onTap != null
                ? Icon(Icons.chevron_right,
                    size: 20, color: cs.onSurfaceVariant)
                : null,
        onTap: onTap,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      );

  Widget _toggle(
    ColorScheme cs, {
    required IconData icon,
    required String title,
    required bool isOn,
  }) =>
      ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
              color: cs.primaryContainer,
              borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 20, color: cs.primary),
        ),
        title: Text(title,
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: cs.onSurface)),
        trailing: Switch(value: isOn, onChanged: (_) {}),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      );

  Widget _div(ColorScheme cs) => Divider(
      height: 1,
      thickness: 1,
      indent: 72,
      endIndent: 16,
      color: cs.outlineVariant);

  Widget _themeSelector(BuildContext context, ColorScheme cs) {
    final tp = Provider.of<ThemeProvider>(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                    color: cs.primaryContainer,
                    borderRadius: BorderRadius.circular(10)),
                child: Icon(Icons.palette_outlined, size: 20, color: cs.primary),
              ),
              const SizedBox(width: 16),
              Text('Theme',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: cs.onSurface)),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                  child: _themeOpt(context, cs, Icons.light_mode, 'Light',
                      tp.themeMode == ThemeMode.light,
                      () => tp.setThemeMode(ThemeMode.light))),
              const SizedBox(width: 12),
              Expanded(
                  child: _themeOpt(context, cs, Icons.dark_mode, 'Dark',
                      tp.themeMode == ThemeMode.dark,
                      () => tp.setThemeMode(ThemeMode.dark))),
              const SizedBox(width: 12),
              Expanded(
                  child: _themeOpt(
                      context, cs, Icons.brightness_auto, 'System',
                      tp.themeMode == ThemeMode.system,
                      () => tp.setThemeMode(ThemeMode.system))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _themeOpt(BuildContext context, ColorScheme cs, IconData icon,
      String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected
              ? cs.primaryContainer
              : cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? cs.primary : cs.outline.withOpacity(0.2),
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(icon,
                size: 24,
                color: selected ? cs.primary : cs.onSurfaceVariant),
            const SizedBox(height: 4),
            Text(label,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight:
                        selected ? FontWeight.w600 : FontWeight.w500,
                    color: selected ? cs.primary : cs.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
