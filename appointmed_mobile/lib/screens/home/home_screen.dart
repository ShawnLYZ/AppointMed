import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/appointments_provider.dart';
import '../../models/appointment_model.dart';
import '../../widgets/hover_scale.dart';
import '../../widgets/hover_button.dart';

class HomeScreen extends StatelessWidget {
  final VoidCallback? onChatTap;
  final VoidCallback? onAppointmentsTap;

  const HomeScreen({super.key, this.onChatTap, this.onAppointmentsTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final auth = context.watch<AuthProvider>();
    final appointments = context.watch<AppointmentsProvider>();
    final firstName = auth.userModel?.fullName.split(' ').first ?? 'there';

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Hello, $firstName! 👋',
                          style: theme.textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: colorScheme.onSurface),
                        ),
                        const SizedBox(height: 4),
                        Text('How can we help you today?',
                            style: theme.textTheme.bodyMedium?.copyWith(
                                color: colorScheme.onSurfaceVariant)),
                      ],
                    ),
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: colorScheme.primaryContainer,
                      backgroundImage: auth.userModel?.avatarUrl != null
                          ? NetworkImage(auth.userModel!.avatarUrl!)
                          : null,
                      child: auth.userModel?.avatarUrl == null
                          ? Text(
                              auth.userModel?.initials ?? '?',
                              style: TextStyle(
                                  color: colorScheme.primary,
                                  fontWeight: FontWeight.w600),
                            )
                          : null,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // AI banner
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.primary500, AppColors.primary700],
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Need medical advice?',
                                style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white)),
                            const SizedBox(height: 8),
                            Text(
                              'Chat with our AI assistant\nand book appointments instantly.',
                              style: TextStyle(
                                  fontSize: 14,
                                  color: Colors.white.withOpacity(0.9)),
                            ),
                            const SizedBox(height: 16),
                            HoverPrimaryButton(
                              scale: 1.03,
                              child: ElevatedButton.icon(
                                onPressed: onChatTap,
                                icon: const Icon(Icons.chat_bubble_outline,
                                    size: 18),
                                label: const Text('Start Chat'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.white,
                                  foregroundColor: AppColors.primary700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.psychology_outlined,
                            size: 40, color: Colors.white),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Quick Actions
                Text('Quick Actions',
                    style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: colorScheme.onSurface)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _QuickActionCard(
                        icon: Icons.chat,
                        title: 'AI Chat',
                        subtitle: 'Get recommendations',
                        color: AppColors.primary100,
                        iconColor: AppColors.primary600,
                        onTap: onChatTap ?? () {},
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _QuickActionCard(
                        icon: Icons.calendar_today,
                        title: 'Appointments',
                        subtitle: 'View upcoming',
                        color: AppColors.accent500.withOpacity(0.15),
                        iconColor: AppColors.accent600,
                        onTap: onAppointmentsTap ?? () {},
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Upcoming Appointment
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Upcoming Appointment',
                        style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: colorScheme.onSurface)),
                    TextButton(
                        onPressed: onAppointmentsTap,
                        child: const Text('View All')),
                  ],
                ),
                const SizedBox(height: 12),
                _buildNextAppointment(context, appointments.nextAppointment),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNextAppointment(
      BuildContext context, AppointmentModel? appt) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    if (appt == null) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
                color: colorScheme.shadow,
                blurRadius: 10,
                offset: const Offset(0, 4))
          ],
        ),
        child: Column(
          children: [
            Icon(Icons.calendar_today_outlined,
                size: 40, color: colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text('No upcoming appointments',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: colorScheme.onSurfaceVariant)),
          ],
        ),
      );
    }

    return HoverScale(
      scale: 1.02,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
                color: colorScheme.shadow,
                blurRadius: 10,
                offset: const Offset(0, 4))
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary500, AppColors.primary700],
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Text(appt.doctorInitials,
                    style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: Colors.white)),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(appt.specialistName,
                      style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: colorScheme.onSurface)),
                  const SizedBox(height: 4),
                  Text('${appt.specialty} • ${appt.hospitalName}',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: appt.statusColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      DateFormat('MMM d • hh:mm a').format(appt.dateTime),
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: appt.statusColor),
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: colorScheme.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final Color iconColor;
  final VoidCallback onTap;

  const _QuickActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.iconColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return HoverScale(
      scale: 1.02,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
                color: colorScheme.shadow,
                blurRadius: 10,
                offset: const Offset(0, 4))
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                  color: color, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, size: 22, color: iconColor),
            ),
            const SizedBox(height: 12),
            Text(title,
                style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: colorScheme.onSurface)),
            const SizedBox(height: 2),
            Text(subtitle,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
